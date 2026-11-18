(() => {
  const { els } = window.UI;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const TOKEN_KEY = 'messenger.jwt';
  const USER_KEY = 'messenger.user';
  const APP_STATE_KEY = 'messenger.state';
  const state = {
    user: null, contacts: new Map(), users: new Map(), activeId: null, messages: new Map(),
    online: new Set(), hasMore: false, oldestId: null, loadingOlder: false,
    authMode: 'login', typingTimer: null, toastTimer: null, searchTimer: null,
    callTimer: null, callPeer: null, callPeerId: null, callDirection: null, callCallId: null,
    searchSequence: 0, composing: false, calls: [],
    prefs: {}, drafts: {}, folder: 'all', replyTo: null, editId: null, savedId: null,
  };

  function loadPersistedState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_STATE_KEY) || '{}');
      if (parsed.userId !== state.user?.id) return;
      for (const contact of parsed.contacts || []) state.contacts.set(Number(contact.id), contact);
    } catch { localStorage.removeItem(APP_STATE_KEY); }
  }
  function persistState() {
    if (!state.user) return;
    try { localStorage.setItem(APP_STATE_KEY, JSON.stringify({ userId: state.user.id, contacts: [...state.contacts.values()] })); } catch { /* Private browsing/storage limits should not stop chat. */ }
  }
  function saveSession(user, token) {
    state.user = user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    window.API.setToken(token);
  }
  function clearSession() {
    window.SocketService.disconnect();
    hangupCall(false);
    state.user = null; state.activeId = null; state.contacts.clear(); state.users.clear(); state.messages.clear(); state.online.clear();
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(APP_STATE_KEY);
    window.API.setToken(null);
    window.UI.showAuth(false);
  }
  function currentContact() { return state.activeId ? state.contacts.get(state.activeId) : null; }
  function cacheUser(user) {
    if (!user || !user.id) return;
    state.users.set(Number(user.id), { ...user });
    // Also keep the contacts map in sync when a cached contact gets a fresh name.
    if (state.contacts.has(Number(user.id))) {
      state.contacts.set(Number(user.id), { ...state.contacts.get(Number(user.id)), ...user });
    }
  }
  function showError(error) {
    if (error?.status === 401) { clearSession(); window.UI.showToast('انتهت صلاحية الجلسة. سجّل الدخول مرة ثانية.', 'error'); return; }
    window.UI.showToast(error?.message || 'صار خطأ غير متوقع.', 'error');
  }

  // ---- Profile & Avatar ----
  let cropCanvas = els.cropCanvas;
  let cropCtx = cropCanvas.getContext('2d');
  let cropImage = new Image();
  let cropData = { x: 0, y: 0, size: 512, scale: 1 };

  function handleAvatarSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      window.UI.showToast('نوع الملف غير مدعوم. المسموح: JPEG، PNG، WebP فقط.', 'error');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      window.UI.showToast('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت.', 'error');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      cropImage.onload = () => openCropModal(cropImage);
      cropImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function openCropModal(img) {
    const size = Math.min(img.width, img.height);
    cropCanvas.width = 512;
    cropCanvas.height = 512;
    cropData.size = size;
    cropData.scale = 512 / size;
    cropData.x = (img.width - size) / 2;
    cropData.y = (img.height - size) / 2;
    cropCtx.drawImage(img, cropData.x, cropData.y, size, size, 0, 0, 512, 512);
    els.avatarCropModal.hidden = false;
    els.profileAvatar.classList.add('changed');
    setupCropEvents();
  }

  function setupCropEvents() {
    let isDragging = false, startX = 0, startY = 0;
    const move = (e) => {
      if (!isDragging) return;
      const rect = cropCanvas.getBoundingClientRect();
      const factor = 512 / Math.max(1, rect.width) / cropData.scale;
      const dx = (e.clientX - startX) * factor;
      const dy = (e.clientY - startY) * factor;
      cropData.x = Math.max(0, Math.min(cropImage.width - cropData.size, cropData.x - dx));
      cropData.y = Math.max(0, Math.min(cropImage.height - cropData.size, cropData.y - dy));
      redrawCrop(); startX = e.clientX; startY = e.clientY;
    };
    cropCanvas.onpointerdown = (e) => { isDragging = true; startX = e.clientX; startY = e.clientY; cropCanvas.setPointerCapture?.(e.pointerId); };
    cropCanvas.onpointermove = move;
    cropCanvas.onpointerup = cropCanvas.onpointercancel = () => { isDragging = false; };
    cropCanvas.onwheel = (e) => {
      e.preventDefault();
      const zoom = e.deltaY > 0 ? 0.95 : 1.05;
      const newSize = Math.max(100, Math.min(cropData.size * zoom, Math.min(cropImage.width, cropImage.height)));
      const cx = cropData.x + cropData.size / 2; const cy = cropData.y + cropData.size / 2;
      cropData.size = newSize;
      cropData.x = Math.max(0, Math.min(cropImage.width - newSize, cx - newSize / 2));
      cropData.y = Math.max(0, Math.min(cropImage.height - newSize, cy - newSize / 2));
      cropData.scale = 512 / newSize; redrawCrop();
    };
  }

  function redrawCrop() {
    cropCtx.clearRect(0, 0, 512, 512);
    cropCtx.drawImage(cropImage, cropData.x, cropData.y, cropData.size, cropData.size, 0, 0, 512, 512);
    // The crop canvas is the live preview in the crop dialog.
  }

  async function uploadCroppedAvatar() {
    if (!cropCanvas || !cropImage.src) return;
    const blob = await new Promise(resolve => cropCanvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) { window.UI.showToast('تعذر تجهيز الصورة. جرّب صورة أخرى.', 'error'); return; }
    const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
    els.cropSaveButton.disabled = true; els.cropSaveButton.textContent = 'جارٍ الرفع…';
    els.profileAvatar.classList.add('uploading');
    try {
      const result = await window.API.uploadAvatar(file, (p) => {
        // progress if needed
      });
      if (result?.user) {
        state.user = { ...state.user, ...result.user };
        cacheUser(result.user);
        window.UI.showMessenger(state.user);
        window.UI.showToast('تم تحديث الصورة الشخصية', 'success');
      }
      closeCropModal();
    } catch (error) {
      showError(error);
    } finally {
      els.profileAvatar.classList.remove('uploading', 'changed');
    }
  }

  function closeCropModal() {
    els.avatarCropModal.hidden = true;
    els.avatarInput.value = ''; els.avatarCameraInput.value = '';
    cropCanvas.width = cropCanvas.height = 0; cropImage.src = '';
    cropCanvas.onpointerdown = cropCanvas.onpointermove = cropCanvas.onpointerup = cropCanvas.onpointercancel = cropCanvas.onwheel = null;
    els.cropSaveButton.disabled = false; els.cropSaveButton.textContent = 'استخدام الصورة';
  }

  // Avatar history modal
  async function openAvatarHistory() {
    try {
      const { avatars } = await window.API.getAvatarHistory();
      renderAvatarHistory(avatars);
      els.avatarHistoryModal.hidden = false;
    } catch (error) {
      showError(error);
    }
  }
  function renderAvatarHistory(avatars) {
    els.avatarHistoryList.innerHTML = '';
    if (!avatars.length) {
      els.avatarHistoryList.textContent = 'لا توجد صور سابقة';
      return;
    }
    for (const avatar of avatars) {
      const item = document.createElement('div');
      item.className = `avatar-history-item${avatar.is_current ? ' current' : ''}`;
      const avatarEl = document.createElement('div');
      avatarEl.className = 'avatar';
      if (avatar.path) {
        const img = document.createElement('img');
        img.src = window.API.fileUrl(avatar.path.split('/').pop()) + '&t=' + Date.now();
        avatarEl.append(img);
      } else {
        avatarEl.textContent = 'م';
      }
      const date = document.createElement('div');
      date.className = 'date';
      date.textContent = new Date(avatar.created_at).toLocaleDateString('ar-IQ');
      const actions = document.createElement('div');
      actions.className = 'actions';
      if (!avatar.is_current) {
        const setBtn = document.createElement('button');
        setBtn.className = 'action-btn';
        setBtn.title = 'تعيين كصورة حالية';
        setBtn.innerHTML = '<svg class="ic"><use href="assets/icons.svg#i-check"/></svg>';
        setBtn.onclick = () => setCurrentAvatar(avatar.id);
        actions.append(setBtn);
      }
      const delBtn = document.createElement('button');
      delBtn.className = 'action-btn danger';
      delBtn.title = 'حذف';
      delBtn.innerHTML = '<svg class="ic"><use href="assets/icons.svg#i-trash-2"/></svg>';
      delBtn.onclick = () => deleteAvatar(avatar.id);
      actions.append(delBtn);
      item.append(avatarEl, date, actions);
      els.avatarHistoryList.append(item);
    }
  }
  async function setCurrentAvatar(id) {
    try {
      const { user } = await window.API.setCurrentAvatar(id);
      state.user = { ...state.user, ...user };
      cacheUser(user);
      window.UI.showMessenger(state.user);
      window.UI.showToast('تم تعيين الصورة الحالية', 'success');
      openAvatarHistory(); // refresh
    } catch (error) { showError(error); }
  }
  async function deleteAvatar(id) {
    if (!confirm('هل تريد حذف هذه الصورة من السجل؟')) return;
    try {
      const { user } = await window.API.deleteAvatar(id);
      state.user = { ...state.user, ...user };
      cacheUser(user);
      window.UI.showMessenger(state.user);
      window.UI.showToast('تم حذف الصورة', 'success');
      openAvatarHistory();
    } catch (error) { showError(error); }
  }
  async function removeCurrentAvatar() {
    if (!confirm('هل تريد إزالة الصورة الشخصية الحالية؟')) return;
    try {
      const { user } = await window.API.removeAvatar();
      state.user = { ...state.user, ...user };
      cacheUser(user);
      window.UI.showMessenger(state.user);
      window.UI.showToast('تم إزالة الصورة الشخصية', 'success');
    } catch (error) { showError(error); }
  }

  // Username availability check with debounce
  let usernameCheckTimer = null;
  function onUsernameInput() {
    clearTimeout(usernameCheckTimer);
    const username = els.profileUsername.value.trim().toLowerCase();
    els.usernameAvailable.textContent = '';
    els.usernameCheckSpinner.hidden = true;
    if (username.length < 5) return;
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return;
    if (username === state.user.username.toLowerCase()) {
      els.usernameAvailable.textContent = 'هذا اسمك الحالي';
      els.usernameAvailable.style.color = 'var(--ink-2)';
      return;
    }
    els.usernameCheckSpinner.hidden = false;
    usernameCheckTimer = setTimeout(async () => {
      try {
        const { available } = await window.API.checkUsername(username);
        els.usernameCheckSpinner.hidden = true;
        if (available) {
          els.usernameAvailable.textContent = 'اسم المستخدم متاح ✓';
          els.usernameAvailable.style.color = 'var(--accent)';
        } else {
          els.usernameAvailable.textContent = 'اسم المستخدم مستخدم ✗';
          els.usernameAvailable.style.color = '#d64550';
        }
      } catch { els.usernameCheckSpinner.hidden = true; }
    }, 400);
  }

  // Bio character counter
  function onBioInput() {
    const len = els.profileBio.value.length;
    const counter = $('#bio-counter'); if (counter) counter.textContent = String(len);
    if (len > 140) els.profileBio.value = els.profileBio.value.slice(0, 140);
  }

  // Privacy settings
  async function loadPrivacySettings() {
    try {
      const user = await window.API.getMe();
      state.user = user;
      cacheUser(user);
      if (els.privacyLastSeen) els.privacyLastSeen.value = user.last_seen_visibility || 'everyone';
      if (els.privacyGroups) els.privacyGroups.value = user.group_add_policy || 'everyone';
    } catch (error) { showError(error); }
  }
  async function onPrivacyChange(key, value) {
    try {
      const user = await window.API.updateProfile({ [key]: value });
      state.user = user;
      cacheUser(user);
      window.UI.showMessenger(state.user);
      window.UI.showToast('تم تحديث إعدادات الخصوصية', 'success');
    } catch (error) { showError(error); }
  }

  // Blocked users
  async function loadBlockedUsers() {
    try {
      const { blocked } = await window.API.getBlocks();
      renderBlockedUsers(blocked);
    } catch (error) { showError(error); }
  }
  function renderBlockedUsers(blocked) {
    if (!els.blockedList) return;
    if (!blocked.length) {
      els.blockedList.innerHTML = '';
      els.blockedEmpty.hidden = false;
      return;
    }
    els.blockedEmpty.hidden = true;
    els.blockedList.innerHTML = '';
    for (const u of blocked) {
      const item = document.createElement('div');
      item.className = 'blocked-item';
      const avatar = document.createElement('span');
      avatar.className = `avatar ${window.UI.avatarColor(u.id)}`;
      window.UI.paintAvatar(avatar, u);
      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = window.UI.getDisplayName(u);
      const username = document.createElement('div');
      username.className = 'username';
      username.textContent = `@${u.username}`;
      info.append(name, username);
      const unblockBtn = document.createElement('button');
      unblockBtn.className = 'unblock-btn';
      unblockBtn.textContent = 'إلغاء الحظر';
      unblockBtn.onclick = async () => {
        try {
          await window.API.unblockUser(u.id);
          window.UI.showToast('تم إلغاء الحظر', 'success');
          loadBlockedUsers();
        } catch (error) { showError(error); }
      };
      item.append(avatar, info, unblockBtn);
      els.blockedList.append(item);
    }
  }

  // Sessions
  async function loadSessions() {
    try {
      const { sessions } = await window.API.getSessions();
      renderSessions(sessions);
    } catch (error) { showError(error); }
  }
  function renderSessions(sessions) {
    if (!els.sessionsList) return;
    if (!sessions.length) {
      els.sessionsList.innerHTML = '';
      els.sessionsEmpty.hidden = false;
      return;
    }
    els.sessionsEmpty.hidden = true;
    els.sessionsList.innerHTML = '';
    for (const s of sessions) {
      const item = document.createElement('div');
      item.className = `session-item${s.current ? ' current' : ''}`;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.innerHTML = '<svg class="ic"><use href="assets/icons.svg#i-device-mobile"/></svg>';
      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = s.user_agent?.includes('Mobile') ? 'هاتف' : 'كمبيوتر';
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = `آخر نشاط: ${new Date(s.last_seen).toLocaleString('ar-IQ')}${s.ip ? ` · ${s.ip}` : ''}`;
      info.append(name, meta);
      const revokeBtn = document.createElement('button');
      revokeBtn.className = 'revoke-btn';
      revokeBtn.textContent = 'إلغاء الجلسة';
      revokeBtn.hidden = s.current === true;
      revokeBtn.onclick = async () => {
        if (!confirm('هل تريد إلغاء هذه الجلسة؟')) return;
        try {
          await window.API.revokeSession(s.id);
          window.UI.showToast('تم إلغاء الجلسة', 'success');
          loadSessions();
        } catch (error) { showError(error); }
      };
      item.append(icon, info, revokeBtn);
      els.sessionsList.append(item);
    }
  }

  // Change password
  async function onChangePassword(event) {
    event.preventDefault();
    const btn = els.changePasswordForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'جاري التغيير...';
    try {
      await window.API.changePassword(els.oldPassword.value, els.newPassword.value);
      window.UI.showToast('تم تغيير كلمة المرور. ستحتاج لتسجيل الدخول مجدداً.', 'success');
      els.changePasswordForm.reset();
      setTimeout(() => logout(), 1500);
    } catch (error) { showError(error); }
    finally { btn.disabled = false; btn.textContent = 'تغيير كلمة المرور'; }
  }

  // Delete account
  function openDeleteAccountModal() {
    els.deleteAccountModal.hidden = false;
    els.deleteAccountConfirm.value = '';
    els.deleteAccountSubmit.disabled = true;
  }
  function closeDeleteAccountModal() {
    els.deleteAccountModal.hidden = true;
    els.deleteAccountConfirm.value = '';
  }
  async function onDeleteAccountConfirm(event) {
    event.preventDefault();
    if (els.deleteAccountConfirm.value.trim().toLowerCase() !== 'حذف') return;
    const btn = els.deleteAccountSubmit;
    btn.disabled = true; btn.textContent = 'جاري الحذف...';
    try {
      await window.API.deleteAccount(els.oldPassword.value);
      window.UI.showToast('تم حذف الحساب', 'success');
      logout();
    } catch (error) { showError(error); }
    finally { closeDeleteAccountModal(); }
  }

  // User profile view
  let currentProfileViewUser = null;
  async function openUserProfile(userId) {
    try {
      const { user, canSeeLastSeen, isBlocked, blockedByThem, commonGroups } = await window.API.getUser(userId);
      currentProfileViewUser = user;
      renderUserProfile(user, canSeeLastSeen, isBlocked, blockedByThem, commonGroups);
      els.profileViewModal.hidden = false;
    } catch (error) { showError(error); }
  }
  function renderUserProfile(user, canSeeLastSeen, isBlocked, blockedByThem, commonGroups) {
    els.profileViewAvatar.className = `avatar avatar-xl ${window.UI.avatarColor(user.id)}`;
    window.UI.paintAvatar(els.profileViewAvatar, user);
    els.profileViewName.textContent = window.UI.getDisplayName(user);
    els.profileViewUsername.textContent = `@${user.username}`;
    els.profileViewBio.textContent = user.bio || 'لا توجد نبذة';
    if (canSeeLastSeen && user.last_seen) {
      els.profileViewLastSeen.innerHTML = `<svg class="ic"><use href="assets/icons.svg#i-clock"/></svg><span>آخر ظهور: ${new Date(user.last_seen).toLocaleString('ar-IQ')}</span>`;
    } else {
      els.profileViewLastSeen.innerHTML = '<svg class="ic"><use href="assets/icons.svg#i-clock"/></svg><span>مخفي</span>';
    }
    // Common groups
    const groupsEl = els.querySelector('#profile-view-common-groups .groups-list');
    if (commonGroups && commonGroups.length) {
      groupsEl.innerHTML = '';
      for (const g of commonGroups) {
        const item = document.createElement('div');
        item.className = 'group-item';
        item.textContent = g.name || g.id;
        groupsEl.append(item);
      }
    } else {
      groupsEl.innerHTML = '<p class="helper-text">لا توجد مجموعات مشتركة</p>';
    }
    // Buttons
    const isContact = state.contacts.has(user.id);
    els.profileViewAddContactBtn.textContent = isContact ? 'إزالة من الجهات' : 'إضافة للجهات';
    els.profileViewAddContactBtn.onclick = async () => {
      if (isContact) {
        // Remove contact - not implemented in API yet
        window.UI.showToast('إزالة جهة اتصال غير متاحة بعد', 'error');
      } else {
        try {
          await window.API.addContact(user.id);
          window.UI.showToast('تم إضافة جهة الاتصال', 'success');
          els.profileViewAddContactBtn.textContent = 'إزالة من الجهات';
        } catch (error) { showError(error); }
      }
    };
    els.profileViewMessageBtn.onclick = () => {
      els.profileViewModal.hidden = true;
      openChat({ id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url });
    };
    els.profileViewMuteBtn.onclick = async () => {
      // Mute - placeholder
      window.UI.showToast('الكتم سيتم إضافته قريباً', 'success');
    };
    els.profileViewBlockBtn.textContent = isBlocked ? 'إلغاء الحظر' : 'حظر';
    els.profileViewBlockBtn.onclick = async () => {
      if (isBlocked) {
        try {
          await window.API.unblockUser(user.id);
          window.UI.showToast('تم إلغاء الحظر', 'success');
          els.profileViewBlockBtn.textContent = 'حظر';
        } catch (error) { showError(error); }
      } else {
        try {
          await window.API.blockUser(user.id);
          window.UI.showToast('تم حظر المستخدم', 'success');
          els.profileViewBlockBtn.textContent = 'إلغاء الحظر';
        } catch (error) { showError(error); }
      }
    };
    els.profileViewReportBtn.onclick = () => {
      window.UI.showToast('تم إرسال البلاغ', 'success');
    };
    // Tabs
    $$('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-panel').forEach(p => p.hidden = true);
        btn.classList.add('active');
        const panel = document.getElementById(`profile-view-${btn.dataset.tab}`);
        if (panel) panel.hidden = false;
      };
    });
  }

  // Socket event: profile:updated
  function onProfileUpdated({ userId, user }) {
    const mergedUser = { ...(state.users.get(Number(userId)) || {}), ...(user || {}) };
    cacheUser(mergedUser);
    if (userId === state.user.id) {
      state.user = { ...state.user, ...mergedUser };
      window.UI.showMessenger(state.user);
    }
    if (state.activeId === userId) {
      window.UI.setChatHeader(user, state.online.has(userId));
    }
    renderChats();
    persistState();
  }

  function renderChats() {
    let chats = [...state.contacts.values()].sort((a, b) => {
      const ap = state.prefs[a.id]?.pinned ? 1 : 0;
      const bp = state.prefs[b.id]?.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const aTime = a.lastMessage?.created_at || a.created_at || '';
      const bTime = b.lastMessage?.created_at || b.created_at || '';
      return bTime.localeCompare(aTime);
    });
    const folder = state.folder;
    if (folder === 'archived') chats = chats.filter((c) => state.prefs[c.id]?.archived);
    else if (folder !== 'all') chats = chats.filter((c) => !state.prefs[c.id]?.archived);
    window.UI.renderChats(chats, state.user.id, state.activeId, els.conversationFilter.value, openChat);
    for (const chat of chats) {
      if (!state.prefs[chat.id]?.pinned && !state.prefs[chat.id]?.muted) continue;
      const row = [...els.chatsList.querySelectorAll('.chat-row')].find((r) => r.getAttribute('aria-label') === `محادثة ${chat.username}`);
      if (!row) continue;
      if (state.prefs[chat.id]?.muted) row.classList.add('muted');
      if (state.prefs[chat.id]?.pinned) {
        const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        mark.setAttribute('class', 'ic pin-mark');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', 'assets/icons.svg#i-pin');
        mark.append(use);
        row.querySelector('.chat-row-name')?.after(mark);
      }
    }
    if (!$('#list-screen').querySelector('#chats-panel').hidden) renderContactsView();
  }
  function bumpLastMessage(message, peerId) {
    const contact = state.contacts.get(Number(peerId));
    if (!contact) return;
    const existing = contact.lastMessage;
    if (!existing || Number(message.id) >= Number(existing.id)) contact.lastMessage = message;
    renderChats(); persistState();
  }
  async function loadContacts() {
    const { contacts, prefs } = await window.API.contacts();
    state.prefs = prefs;
    for (const contact of contacts) cacheUser(contact);
    const old = state.contacts;
    state.contacts = new Map(contacts.map((contact) => {
      const cached = old.get(contact.id) || {};
      return [contact.id, { ...cached, ...contact, lastMessage: cached.lastMessage, unread: cached.unread || 0 }];
    }));
    persistState(); renderChats();
    await Promise.allSettled(contacts.map(async (contact) => {
      try {
        const result = await window.API.messages(contact.id);
        const latest = result.messages.at(-1);
        if (latest) bumpLastMessage(latest, contact.id);
      } catch { /* Keep the cached conversation preview if the server is temporarily offline. */ }
    }));
    renderChats();
  }
  async function bootSession(user) {
    state.user = user;
    state.activeId = null;
    state.messages.clear();
    state.contacts.clear();
    state.online.clear();
    window.UI.showWelcome();
    window.UI.closeChatLayout();
    window.API.setToken(localStorage.getItem(TOKEN_KEY));
    loadPersistedState();
    try { user = await window.API.getMe(); } catch (error) { if (error?.status === 401) { clearSession(); return; } }
    state.user = user;
    window.UI.showMessenger(user);
    window.UI.setPanel('chats');
    try { state.calls = JSON.parse(localStorage.getItem('messenger.calls') || '[]'); } catch { state.calls = []; }
    window.API.getDrafts().then((drafts) => { state.drafts = drafts || {}; }).catch(() => {});
    window.UI.setConnection('', 'جارٍ الاتصال...');
    connectSocket();
    try { await loadContacts(); }
    catch (error) { showError(error); }
    const sharedUsername = new URLSearchParams(location.search).get('u');
    if (sharedUsername && sharedUsername.toLowerCase() !== state.user.username.toLowerCase()) {
      try { const matches = await window.API.searchUsers(sharedUsername); const target = matches.find((item) => item.username.toLowerCase() === sharedUsername.toLowerCase()); if (target) openUserProfile(target.id); } catch { /* Profile links remain usable when user search is unavailable. */ }
    }
  }
  function connectSocket() {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      window.SocketService.connect(token, {
        connect: () => window.UI.setConnection('connected', 'متصل بالخادم'),
        disconnect: () => window.UI.setConnection('', 'انقطع الاتصال — نحاول مجدداً'),
        error: () => window.UI.setConnection('error', 'تعذر الاتصال بالخادم'),
        'message:new': onIncomingMessage,
        'message:status': onMessageStatus,
        'message:edited': onMessageEdited,
        'message:deleted': onMessageDeleted,
        'message:reaction': onMessageReaction,
        'typing:start': onTypingStart,
        'typing:stop': onTypingStop,
        'call:incoming': onCallIncoming,
        'call:signal': onCallSignal,
        'call:answered': onCallAnswered,
        'call:ended': onCallEnded,
        presence: onPresence,
        'profile:updated': onProfileUpdated,
      });
    } catch (error) { window.UI.setConnection('error', error.message); }
  }
  function onPresence(event) {
    const id = Number(event.userId);
    if (event.username || event.display_name) cacheUser({ id, username: event.username, display_name: event.display_name, avatar_url: event.avatar_url });
    const contact = state.contacts.get(id);
    if (event.status === 'online') state.online.add(id);
    else { state.online.delete(id); if (contact && event.lastSeen) contact.last_seen = event.lastSeen; }
    if (contact) { renderChats(); persistState(); }
    if (id === state.activeId && contact) window.UI.setChatHeader(contact, state.online.has(id));
  }
  function onIncomingMessage(message) {
    const senderId = Number(message.sender_id);
    if (senderId === state.user.id) { bumpLastMessage(message, message.receiver_id); return; }
    window.SocketService.delivered(message.id);

    // The server now includes a sender object (id, username, display_name, avatar_url) in message:new.
    const sender = message.sender ? { id: message.sender.id, username: message.sender.username, display_name: message.sender.display_name, avatar_url: message.sender.avatar_url } : null;
    if (sender) cacheUser(sender);

    let contact = state.contacts.get(senderId);
    if (!contact) {
      contact = sender || { id: senderId, username: String(senderId), created_at: message.created_at, last_seen: null, lastMessage: message, unread: 1, online: state.online.has(senderId) };
      state.contacts.set(senderId, contact);
      persistState(); renderChats();
      if (!sender) {
        // Fallback: look up the sender by id to get a real name.
        window.API.searchUsers(String(senderId)).then((users) => {
          const found = users.find((user) => Number(user.id) === senderId);
          if (found) { cacheUser(found); Object.assign(contact, found); persistState(); renderChats(); if (state.activeId === senderId) window.UI.setChatHeader(contact, state.online.has(senderId)); }
        }).catch(() => {});
      }
      return;
    }
    // Refresh contact name if a newer sender object arrived.
    if (sender) { Object.assign(contact, sender); persistState(); renderChats(); }
    const isOpen = state.activeId === senderId && !els.activeChat.hidden;
    if (isOpen) {
      const list = state.messages.get(senderId) || [];
      if (!list.some((item) => Number(item.id) === Number(message.id))) { list.push(message); state.messages.set(senderId, list); }
      window.UI.addMessage(message, state.user.id, showMessageMenu);
      window.SocketService.read(message.id);
      contact.unread = 0;
    } else contact.unread = (contact.unread || 0) + 1;
    bumpLastMessage(message, senderId); renderChats(); persistState();
  }
  function onMessageStatus(event) {
    for (const messages of state.messages.values()) {
      const message = messages.find((item) => Number(item.id) === Number(event.messageId));
      if (message) message.status = event.status;
    }
    window.UI.updateMessageStatus(event.messageId, event.status);
    const peerId = state.activeId;
    const contact = peerId ? state.contacts.get(peerId) : null;
    if (contact?.lastMessage?.id === event.messageId) { contact.lastMessage.status = event.status; renderChats(); }
  }
  function onMessageEdited(event) {
    const text = event.text || '';
    for (const messages of state.messages.values()) {
      const message = messages.find((item) => Number(item.id) === Number(event.messageId));
      if (message) { message.text = text; message.edited_at = event.editedAt; }
    }
    window.UI.setMessageEdited(event.messageId, text, event.editedAt);
    const contact = state.contacts.get(state.activeId);
    if (contact?.lastMessage?.id === event.messageId) { contact.lastMessage.text = text; renderChats(); }
  }
  function onMessageDeleted(event) {
    for (const [peerId, messages] of state.messages) {
      const index = messages.findIndex((item) => Number(item.id) === Number(event.messageId));
      if (index < 0) continue;
      messages.splice(index, 1);
      if (state.activeId === peerId) window.UI.removeMessage(event.messageId);
    }
    const contact = state.contacts.get(state.activeId);
    if (contact?.lastMessage?.id === event.messageId) { contact.lastMessage = null; renderChats(); }
  }
  function onMessageReaction(event) {
    for (const messages of state.messages.values()) {
      const message = messages.find((item) => Number(item.id) === Number(event.messageId));
      if (message) message.reaction = event.reaction;
    }
    window.UI.setMessageReaction(event.messageId, event.reaction);
  }
  function onTypingStart(event) {
    if (Number(event.userId) !== state.activeId) return;
    window.UI.setTyping(true, event.username);
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => window.UI.setTyping(false), 3500);
  }
  function onTypingStop(event) {
    if (Number(event.userId) === state.activeId) { clearTimeout(state.typingTimer); window.UI.setTyping(false); }
  }
  const CALL_RING_TIMEOUT = 45000;

  async function startCall(kind = 'audio') {
    const contact = currentContact();
    if (!contact) return;
    if (window.UI.callActive) { window.UI.showToast('هناك مكالمة جارية بالفعل.'); return; }
    if (!window.SocketService.connected) { window.UI.showToast('لا يوجد اتصال بالخادم.', 'error'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { window.UI.showToast('الاتصال يحتاج متصفحاً حديثاً واتصال HTTPS.', 'error'); return; }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(kind === 'video' ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } } : { audio: true });
    } catch (error) {
      window.UI.showToast(error?.name === 'NotAllowedError' ? 'لم تسمح باستخدام الميكروفون/الكاميرا.' : 'تعذّر الوصول إلى الميكروفون/الكاميرا.', 'error');
      return;
    }
    const callId = `c-${state.user.id}-${Date.now()}`;
    const peer = window.UI.createCallPeer({
      kind,
      localStream: stream,
      onIceCandidate: (candidate) => window.SocketService.callSignal(contact.id, callId, { type: 'candidate', data: candidate }),
      onRemoteStream: (remote) => { window.UI.attachRemoteStream(remote); window.UI.setCallConnected(); },
      onPeerClosed: () => hangupCall(true),
    });
    window.callController = { callId, peerId: contact.id, peerName: getDisplayName(contact), kind, direction: 'out', peer, stream, remoteDescriptionSet: false, pendingCandidates: [] };
    window.UI.openCall({ name: getDisplayName(contact), kind, direction: 'out' });
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      window.SocketService.callStart(contact.id, kind, callId);
      window.SocketService.callSignal(contact.id, callId, { type: 'offer', data: offer });
      state.callTimer = setTimeout(() => {
        if (window.callController?.callId === callId && !window.UI.callConnected) {
          window.UI.showToast('لم يُجب الطرف الآخر.', 'error');
          hangupCall(true);
        }
      }, CALL_RING_TIMEOUT);
    } catch {
      window.UI.showToast('تعذّر بدء المكالمة.', 'error');
      hangupCall(true);
    }
  }

  function onCallIncoming(event) {
    if (window.UI.callActive) { window.SocketService.callEnd(Number(event.from), event.callId); return; }
    window.callController = {
      callId: event.callId, peerId: Number(event.from), peerName: getDisplayName(event),
      kind: event.kind === 'video' ? 'video' : 'audio', direction: 'in', pendingOffer: null, pendingCandidates: [], remoteDescriptionSet: false,
    };
    window.UI.incomingCall({ name: getDisplayName(event), kind: event.kind });
    state.callTimer = setTimeout(() => {
      if (window.callController && window.callController.direction === 'in' && !window.UI.callConnected) {
        window.UI.showToast('انتهى وقت الرنين.', 'error');
        hangupCall(true);
      }
    }, CALL_RING_TIMEOUT);
  }

  async function onCallSignal(event) {
    const call = window.callController;
    if (!call || Number(event.from) !== call.peerId || event.callId !== call.callId) return;
    try {
      if (event.signal.type === 'offer' && call.direction === 'in') {
        call.pendingOffer = event.signal.data;
        return;
      }
      if (event.signal.type === 'candidate' && (!call.peer || !call.remoteDescriptionSet)) {
        call.pendingCandidates.push(event.signal.data);
        return;
      }
      if (event.signal.type === 'answer') {
        await call.peer.setRemoteDescription(event.signal.data);
        call.remoteDescriptionSet = true;
        for (const candidate of call.pendingCandidates.splice(0)) await call.peer.addIceCandidate(candidate).catch(() => {});
      } else if (event.signal.type === 'candidate') await call.peer.addIceCandidate(event.signal.data).catch(() => {});
    } catch { /* Ignore malformed or late signaling data; the call can still connect. */ }
  }

  async function answerCall(accept) {
    const call = window.callController;
    if (!call || call.direction !== 'in') return;
    clearTimeout(state.callTimer);
    if (!accept) {
      window.SocketService.callEnd(call.peerId, call.callId);
      window.callController = null;
      window.UI.closeCallLayer();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      window.UI.showToast('الاتصال يحتاج متصفحاً حديثاً واتصال HTTPS.', 'error');
      window.SocketService.callEnd(call.peerId, call.callId);
      window.callController = null;
      window.UI.closeCallLayer();
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(call.kind === 'video' ? { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } } : { audio: true });
    } catch (error) {
      window.UI.showToast(error?.name === 'NotAllowedError' ? 'لم تسمح باستخدام الميكروفون/الكاميرا.' : 'تعذّر الوصول إلى الميكروفون/الكاميرا.', 'error');
      window.SocketService.callEnd(call.peerId, call.callId);
      window.callController = null;
      window.UI.closeCallLayer();
      return;
    }
    const peer = window.UI.createCallPeer({
      kind: call.kind,
      localStream: stream,
      onIceCandidate: (candidate) => window.SocketService.callSignal(call.peerId, call.callId, { type: 'candidate', data: candidate }),
      onRemoteStream: (remote) => { window.UI.attachRemoteStream(remote); window.UI.setCallConnected(); },
      onPeerClosed: () => hangupCall(true),
    });
    call.peer = peer;
    call.stream = stream;
    try {
      await peer.setRemoteDescription(call.pendingOffer);
      call.remoteDescriptionSet = true;
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      window.SocketService.callAnswer(call.peerId, call.callId, true);
      window.SocketService.callSignal(call.peerId, call.callId, { type: 'answer', data: answer });
      for (const candidate of call.pendingCandidates.splice(0)) await peer.addIceCandidate(candidate).catch(() => {});
      call.pendingOffer = null;
      window.UI.showActiveCall({ name: call.peerName, kind: call.kind });
    } catch {
      window.UI.showToast('تعذّر قبول المكالمة.', 'error');
      hangupCall(true);
    }
  }

  async function onCallAnswered(event) {
    const call = window.callController;
    if (!call || Number(event.from) !== call.peerId || call.direction !== 'out') return;
    if (!event.accepted) {
      window.UI.showToast('رفض الطرف الآخر المكالمة.', 'error');
      hangupCall(false);
    }
  }

  function logCall(call) {
    state.calls.unshift({ ...call, at: new Date().toISOString() });
    state.calls = state.calls.slice(0, 50);
    try { localStorage.setItem('messenger.calls', JSON.stringify(state.calls)); } catch { /* Storage can be unavailable. */ }
    renderCallsView();
  }

  function hangupCall(notify = true) {
    const call = window.callController;
    if (call) {
      if (notify) window.SocketService.callEnd(call.peerId, call.callId);
      logCall({ peerId: call.peerId, name: call.peerName, kind: call.kind, direction: call.direction, result: window.UI.callConnected ? 'completed' : (call.direction === 'in' ? 'missed' : 'missed') });
    }
    window.callController = null;
    clearTimeout(state.callTimer);
    window.UI.closeCallLayer();
  }

  function onCallEnded(event) {
    const call = window.callController;
    if (!call || Number(event.from) !== call.peerId) return;
    logCall({ peerId: call.peerId, name: call.peerName, kind: call.kind, direction: call.direction, result: window.UI.callConnected ? 'completed' : 'missed' });
    window.callController = null;
    clearTimeout(state.callTimer);
    window.UI.closeCallLayer();
    window.UI.showToast('انتهت المكالمة.');
  }

  function toggleMute() {
    const call = window.callController;
    const track = call?.stream?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    window.UI.setMuteVisual(!track.enabled);
  }

  function toggleCamera() {
    const call = window.callController;
    const track = call?.stream?.getVideoTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    window.UI.setCameraVisual(!track.enabled);
  }

  /* ---------- Phase 3 helpers ---------- */
  const menu = $('#message-menu');
  function closeMenu() { menu.hidden = true; menu.replaceChildren(); }
  function showMessageMenu(event, message, mine) {
    const actions = [
      { key: 'reply', label: 'رد', icon: 'corner-up-left' },
      { key: 'react', label: 'تفاعل', icon: 'smile' },
      { key: 'copy', label: 'نسخ', icon: 'copy' },
    ];
    if (mine) actions.push(
      { key: 'edit', label: 'تعديل', icon: 'pencil' },
      { key: 'delete', label: 'حذف', icon: 'trash-2' },
      { key: 'delete-all', label: 'حذف للجميع', icon: 'trash-2' },
    );
    menu.replaceChildren();
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.action = action.key;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ic');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `assets/icons.svg#i-${action.icon}`);
      svg.append(use);
      const label = document.createElement('span'); label.textContent = action.label;
      button.append(svg, label);
      button.addEventListener('click', () => { closeMenu(); handleMessageAction(action.key, message); });
      menu.append(button);
    }
    const x = event?.clientX ?? innerWidth / 2;
    const y = event?.clientY ?? innerHeight / 2;
    menu.hidden = false;
    menu.style.left = `${Math.min(x, innerWidth - 200)}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - 260))}px`;
  }
  function handleMessageAction(action, message) {
    if (action === 'reply') { state.replyTo = message; window.UI.showReply((message.text || '').slice(0, 80)); els.messageInput.focus(); }
    else if (action === 'copy') { navigator.clipboard?.writeText(message.text || '').catch(() => {}); window.UI.showToast('تم النسخ.', 'success'); }
    else if (action === 'react') {
      const reaction = window.prompt('رمز التفاعل (أو اتركه فارغاً للإزالة):', message.reaction || '👍');
      if (reaction !== null) window.SocketService.reactToMessage(message.id, reaction.trim() || null);
    }
    else if (action === 'edit') {
      const text = window.prompt('تعديل الرسالة:', message.text || '');
      if (text !== null && text.trim()) window.SocketService.editMessage(message.id, text.trim().slice(0, 4000));
    }
    else if (action === 'delete' || action === 'delete-all') {
      window.SocketService.deleteMessage(message.id, action === 'delete-all' ? 'everyone' : 'me');
    }
  }
  function saveDraft() {
    if (!state.activeId || state.activeId === state.user?.id) return;
    state.drafts[state.activeId] = els.messageInput.value;
    clearTimeout(state.draftTimer);
    state.draftTimer = setTimeout(() => window.API.saveDraft(state.activeId, els.messageInput.value).catch(() => {}), 600);
  }
  async function togglePref(changes) {
    if (!state.activeId || state.activeId === state.user?.id) return;
    try {
      await window.API.setPref(state.activeId, changes);
      state.prefs[state.activeId] = { ...(state.prefs[state.activeId] || {}), ...changes };
      renderChats();
    } catch (error) { showError(error); }
  }
  function openSavedMessages() {
    openChat({ id: state.user.id, username: state.user.username, display_name: state.user.display_name || 'الرسائل المحفوظة', last_seen: null });
  }
  async function saveProfile(event) {
    event.preventDefault();
    const submitBtn = els.profileForm.querySelector('button[type="submit"]');
    const firstName = els.profileFirstName.value.trim();
    const lastName = els.profileLastName.value.trim();
    const newUsername = els.profileUsername.value.trim().toLowerCase();
    if (!firstName) { window.UI.showToast('يرجى كتابة الاسم الأول.', 'error'); els.profileFirstName.focus(); return; }
    const currentUsername = state.user?.username?.toLowerCase() || '';
    if (newUsername !== currentUsername && !/^[a-zA-Z0-9_]{5,32}$/.test(newUsername)) { window.UI.showToast('اسم المستخدم الجديد يجب أن يتكون من 5 إلى 32 حرفاً إنجليزياً أو رقماً أو _.', 'error'); els.profileUsername.focus(); return; }
    const birthDate = els.profileBirthDate.value || null;
    if (birthDate && birthDate > new Date().toISOString().slice(0, 10)) { window.UI.showToast('تاريخ الميلاد لا يمكن أن يكون في المستقبل.', 'error'); return; }
    const data = { first_name: firstName, last_name: lastName || null, bio: els.profileBio.value.trim() || null, birth_date: birthDate };
    if (newUsername !== currentUsername) data.username = newUsername;
    submitBtn.disabled = true; submitBtn.textContent = 'جاري الحفظ...';
    try {
      const user = await window.API.updateProfile(data);
      state.user = user;
      cacheUser(user);
      window.UI.showMessenger(user);
      window.UI.showToast('تم حفظ الملف الشخصي', 'success');
    } catch (error) { showError(error); }
    finally { submitBtn.disabled = false; submitBtn.textContent = 'حفظ التغييرات'; }
  }

  async function openChat(contact) {
    state.activeId = Number(contact.id);
    contact.unread = 0;
    state.hasMore = false; state.oldestId = null;
    state.replyTo = null; state.editId = null;
    window.UI.hideReply();
    renderChats(); persistState();
    window.UI.setChatHeader(contact, state.online.has(state.activeId));
    window.UI.showChat(); window.UI.openChatLayout(); window.UI.setTyping(false);
    els.messageInput.value = state.drafts[state.activeId] || '';
    els.messageList.replaceChildren();
    try {
      const result = state.activeId === state.user?.id ? await window.API.savedMessages() : await window.API.messages(state.activeId);
      if (state.activeId !== Number(contact.id)) return;
      for (const message of result.messages) {
        const peerId = Number(message.sender_id) === state.user.id ? Number(message.receiver_id) : Number(message.sender_id);
        const peer = state.contacts.get(peerId);
        if (peer && (!peer.lastMessage || Number(message.id) > Number(peer.lastMessage.id))) peer.lastMessage = message;
      }
      state.messages.set(state.activeId, result.messages);
      state.hasMore = result.hasMore;
      state.oldestId = result.messages[0]?.id || null;
      window.UI.renderMessages(result.messages, state.user.id, showMessageMenu);
      window.UI.setOlderAvailable(state.hasMore);
      renderChats();
      persistState();
      window.UI.scrollToBottom(false);
      for (const message of result.messages) if (Number(message.receiver_id) === state.user.id && message.status !== 'read') window.SocketService.read(message.id);
    } catch (error) { showError(error); }
  }
  async function loadOlderMessages() {
    if (!state.activeId || !state.hasMore || state.loadingOlder || !state.oldestId) return;
    const chatId = state.activeId;
    state.loadingOlder = true; els.loadOlder.disabled = true; els.loadOlder.textContent = 'جارٍ التحميل...';
    try {
      const result = await window.API.messages(chatId, state.oldestId);
      if (state.activeId !== chatId) return;
      state.hasMore = result.hasMore;
      state.oldestId = result.messages[0]?.id || state.oldestId;
      const current = state.messages.get(chatId) || [];
      const ids = new Set(current.map((item) => Number(item.id)));
      const older = result.messages.filter((item) => !ids.has(Number(item.id)));
      state.messages.set(chatId, [...older, ...current]);
      window.UI.prependOlder(older, state.user.id, showMessageMenu);
      window.UI.setOlderAvailable(state.hasMore);
    } catch (error) { showError(error); }
    finally { state.loadingOlder = false; els.loadOlder.disabled = false; els.loadOlder.textContent = '↑ تحميل رسائل أقدم'; }
  }
  function detectKind(file) {
    const type = String(file.type || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type.startsWith('audio/')) return 'audio';
    if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/.test(name)) return 'image';
    if (/\.(mp4|webm|mov|m4v|mkv)$/.test(name)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|aac|opus|flac)$/.test(name)) return 'audio';
    return 'file';
  }
  function readableSize(bytes) {
    const units = ['بايت', 'كيلوبايت', 'ميجابايت'];
    let value = Number(bytes) || 0; let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
  }
  function afterSent(contact, message) {
    const list = state.messages.get(contact.id) || [];
    if (!list.some((item) => Number(item.id) === Number(message.id))) list.push(message);
    state.messages.set(contact.id, list);
    if (state.activeId === contact.id && !els.activeChat.hidden) window.UI.addMessage(message, state.user.id, showMessageMenu);
    if (contact.id !== state.user.id) bumpLastMessage(message, contact.id);
  }
  let uploadLabel = '';
  function showUpload(name) {
    uploadLabel = name;
    els.uploadName.textContent = name;
    els.uploadFill.style.width = '0%';
    els.uploadStatus.hidden = false;
  }
  function setUploadProgress(ratio, totalBytes) {
    const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    els.uploadFill.style.width = `${percent}%`;
    els.uploadName.textContent = `${uploadLabel} — ${percent}%${totalBytes ? ` من ${readableSize(totalBytes)}` : ''}`;
  }
  function hideUpload() {
    els.uploadStatus.hidden = true;
    els.uploadFill.style.width = '0%';
    uploadLabel = '';
  }
  async function handleFiles(fileList) {
    const contact = currentContact();
    const files = [...(fileList || [])];
    if (!files.length) return;
    if (!contact) { window.UI.showToast('اختر محادثة أولاً لإرسال الملفات.', 'error'); els.fileInput.value = ''; return; }
    const limit = window.API.maxUploadBytes || 50 * 1024 * 1024;
    let cancelled = false;
    for (const file of files) {
      if (file.size > limit) {
        window.UI.showToast(`«${file.name}» أكبر من ${Math.round(limit / (1024 * 1024))} ميجابايت ولن يُرسل.`, 'error', 4200);
        continue;
      }
      if (!file.size) { window.UI.showToast(`«${file.name}» فارغ ولن يُرسل.`, 'error'); continue; }
      showUpload(file.name);
      try {
        const uploaded = await window.API.uploadFile(file, (ratio) => setUploadProgress(ratio, file.size));
        const caption = els.messageInput.value.trim();
        if (caption) { els.messageInput.value = ''; resizeTextarea(); window.API.saveDraft(contact.id, '').catch(() => {}); }
        hideUpload();
        const message = await window.SocketService.send(contact.id, caption, { kind: detectKind(file), attachmentId: uploaded.id });
        afterSent(contact, message);
      } catch (error) {
        hideUpload();
        if (error?.aborted) { cancelled = true; window.UI.showToast('تم إلغاء الرفع.'); }
        else showError(error);
        if (cancelled) break;
      }
    }
    els.fileInput.value = '';
  }
  function closeStickers() { els.stickerPanel.hidden = true; }
  function toggleStickers() {
    if (!els.stickerPanel.hidden) { closeStickers(); return; }
    const pack = window.StickerPack?.items || [];
    els.stickerGrid.replaceChildren();
    for (const sticker of pack) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = sticker.label || sticker.id;
      button.setAttribute('aria-label', sticker.label || sticker.id);
      const image = document.createElement('img');
      image.src = `assets/stickers/${encodeURIComponent(sticker.id)}.svg`;
      image.alt = sticker.label || 'ملصق';
      image.loading = 'lazy';
      image.draggable = false;
      button.append(image);
      button.addEventListener('click', async () => {
        closeStickers();
        const contact = currentContact();
        if (!contact) return;
        try {
          const message = await window.SocketService.send(contact.id, '', { kind: 'sticker', sticker: sticker.id });
          afterSent(contact, message);
        } catch (error) { showError(error); }
      });
      els.stickerGrid.append(button);
    }
    if (!pack.length) {
      const empty = document.createElement('p');
      empty.className = 'sticker-empty';
      empty.textContent = 'الملصقات غير متاحة.';
      els.stickerGrid.append(empty);
    }
    els.stickerPanel.hidden = false;
  }
  async function submitMessage(event) {
    event.preventDefault();
    const text = els.messageInput.value.trim();
    const contact = currentContact();
    if (!text || !contact) return;
    els.messageInput.value = ''; resizeTextarea(); window.SocketService.typingStop(contact.id);
    const reply = state.replyTo;
    state.replyTo = null; window.UI.hideReply();
    delete state.drafts[contact.id];
    window.API.saveDraft(contact.id, '').catch(() => {});
    try {
      const message = await window.SocketService.send(contact.id, text);
      if (reply) message.reply = { id: reply.id, sender_id: reply.sender_id, text: reply.text };
      const list = state.messages.get(contact.id) || [];
      if (!list.some((item) => Number(item.id) === Number(message.id))) { list.push(message); state.messages.set(contact.id, list); }
      window.UI.addMessage(message, state.user.id, showMessageMenu);
      if (contact.id !== state.user.id) bumpLastMessage(message, contact.id);
    } catch (error) { els.messageInput.value = text; showError(error); }
  }
  function resizeTextarea() { els.messageInput.style.height = 'auto'; els.messageInput.style.height = `${Math.min(els.messageInput.scrollHeight, 120)}px`; }
  function inputTyping() {
    resizeTextarea(); saveDraft();
    const contact = currentContact(); if (!contact) return;
    window.SocketService.typingStart(contact.id);
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => window.SocketService.typingStop(contact.id), 1100);
  }
  function showSearch() { window.UI.setSearchTab(true); els.peopleQuery.value = ''; els.searchResults.replaceChildren(); }
  function showChats() { window.UI.setSearchTab(false); }
  async function runSearch() {
    const query = els.peopleQuery.value.trim();
    els.clearPeopleSearch.hidden = !query;
    const sequence = ++state.searchSequence;
    if (!query) { window.UI.renderPeople([], new Set()); return; }
    window.UI.renderPeople([], new Set(), { loading: true });
    try {
      const users = await window.API.searchUsers(query);
      if (sequence !== state.searchSequence) return;
      window.UI.renderPeople(users, new Set(state.contacts.keys()));
    } catch (error) { if (sequence === state.searchSequence) window.UI.renderPeople([], new Set(), { error: error.message }); }
  }
  function scheduleSearch() { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(runSearch, 260); }
  async function addContact(contactId, button) {
    button.disabled = true; button.textContent = 'جارٍ الإضافة...';
    try {
      const contact = await window.API.addContact(contactId);
      state.contacts.set(contact.id, { ...contact, unread: 0, lastMessage: null });
      persistState(); renderChats();
      const users = await window.API.searchUsers(els.peopleQuery.value.trim());
      window.UI.renderPeople(users, new Set(state.contacts.keys()));
      window.UI.showToast(`أضفت ${getDisplayName(contact)} إلى جهاتك`, 'success');
    } catch (error) { button.disabled = false; button.textContent = '＋ إضافة'; showError(error); }
  }
  async function onAuthSubmit(event) {
    event.preventDefault();
    const username = els.authUsername.value.trim(); const password = els.authPassword.value;
    window.UI.setAuthError(''); els.authSubmit.disabled = true; els.authSubmit.textContent = 'لحظة...';
    try {
      const result = state.authMode === 'register' ? await window.API.register(username, password) : await window.API.login(username, password);
      saveSession(result.user, result.token); els.authForm.reset(); await bootSession(result.user);
    } catch (error) { window.UI.setAuthError(error.message); }
    finally { els.authSubmit.disabled = false; els.authSubmit.textContent = state.authMode === 'register' ? 'إنشاء الحساب' : 'دخول'; }
  }
  function logout() { clearSession(); }
  function toggleTheme() {
    const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    window.UI.setTheme(next === 'dark');
    try { localStorage.setItem('messenger.theme', next); } catch { /* Ignore unavailable storage. */ }
  }
  function showSearch() { window.UI.setSearchTab(true); els.peopleQuery.value = ''; els.searchResults.replaceChildren(); }
  function showChats() { window.UI.setSearchTab(false); }
  function profileUrl() { return `${location.origin}${location.pathname}?u=${encodeURIComponent(state.user?.username || '')}`; }
  function openAvatarSource() { els.avatarSourceModal.hidden = false; }
  function closeAvatarSource() { els.avatarSourceModal.hidden = true; }
  async function shareProfile() {
    const url = profileUrl();
    try {
      if (navigator.share) await navigator.share({ title: `ملف ${window.UI.getDisplayName(state.user)}`, text: `تواصل معي على Bird: @${state.user.username}`, url });
      else { await navigator.clipboard.writeText(url); window.UI.showToast('تم نسخ رابط الملف الشخصي.', 'success'); }
    } catch (error) { if (error?.name !== 'AbortError') window.UI.showToast('تعذرت مشاركة الرابط. انسخه من زر رمز QR.', 'error'); }
  }
  function showProfileQr() {
    const url = profileUrl();
    const endpoint = 'https://api.qrserver.com/v1/create-qr-code/';
    els.profileQrImage.src = `${endpoint}?size=256x256&format=png&data=${encodeURIComponent(url)}`;
    els.profileQrImage.onerror = () => { els.profileQrImage.alt = 'تعذر تحميل رمز QR، يمكنك مشاركة الرابط بدلاً من ذلك.'; };
    els.profileQrModal.hidden = false;
  }
  function closeProfileQr() { els.profileQrModal.hidden = true; }
  function openAccount() { showPanel('account'); els.profileFirstName.focus({ preventScroll: true }); }
  function openSettings() { showPanel('settings'); loadPrivacySettings(); loadBlockedUsers(); loadSessions(); }
  function showPanel(name) {
    window.UI.setPanel(name);
    if (name === 'contacts') renderContactsView();
    if (name === 'calls') renderCallsView();
  }
  function renderContactsView() {
    window.UI.renderContacts([...state.contacts.values()].sort((a, b) => (a.username || '').localeCompare(b.username || '')), (contact) => openChat(contact));
  }
  function renderCallsView() {
    window.UI.renderCalls(state.calls || [], (call) => {
      const contact = state.contacts.get(call.peerId);
      if (contact) openChat(contact); else window.UI.showToast('جهة الاتصال غير موجودة.');
    });
  }
  function restoreTheme() {
    let theme = null;
    try { theme = localStorage.getItem('messenger.theme'); } catch { /* Keep system preference. */ }
    window.UI.setTheme(theme ? theme === 'dark' : true);
  }
  function setupEvents() {
    const setAuthMode = (mode) => {
      state.authMode = mode; window.UI.authMode(mode === 'register');
      els.authUsername.minLength = mode === 'register' ? 5 : 3;
      els.authUsername.pattern = mode === 'register' ? '[A-Za-z0-9_]{5,32}' : '[A-Za-z0-9_]{3,32}';
    };
    els.loginTab.addEventListener('click', () => setAuthMode('login'));
    els.registerTab.addEventListener('click', () => setAuthMode('register'));
    els.authForm.addEventListener('submit', onAuthSubmit);
    els.logoutButton.addEventListener('click', logout);
    els.themeButton.addEventListener('click', toggleTheme);
    $('#drawer-button').addEventListener('click', window.UI.openDrawer);
    $('#drawer-backdrop').addEventListener('click', window.UI.closeDrawer);
    $$('[data-drawer]').forEach((item) => item.addEventListener('click', () => {
      window.UI.closeDrawer();
      const action = item.dataset.drawer;
      if (action === 'theme') return toggleTheme();
      if (action === 'contacts') return showPanel('contacts');
      if (action === 'calls') return showPanel('calls');
      if (action === 'settings') { openSettings(); return; }
      if (action === 'invite') { const link = `${location.origin}/u/${state.user?.username || ''}`; navigator.clipboard?.writeText(link).catch(() => {}); window.UI.showToast('تم نسخ رابط الدعوة.', 'success'); return; }
      if (action === 'saved') { openSavedMessages(); return; }
      window.UI.showToast('ستتوفر هذه الميزة قريباً.');
    }));

    // Profile and account pages
    $('#nav-profile').addEventListener('click', () => showPanel('profile'));
    $('#edit-account-button').addEventListener('click', openAccount);
    $('#account-back-button').addEventListener('click', () => showPanel('profile'));
    $('#profile-settings-button').addEventListener('click', openSettings);
    els.profileForm.addEventListener('submit', saveProfile);
    els.profileFirstName.addEventListener('input', () => { els.profileFirstName.setCustomValidity(''); });
    els.profileUsername.addEventListener('input', onUsernameInput);
    els.profileBio.addEventListener('input', onBioInput);

    // Avatar: explicit gallery/camera choices and an in-image add button.
    els.profileAvatar.addEventListener('click', openAvatarSource);
    $('#profile-add-photo').addEventListener('click', openAvatarSource);
    $('#choose-gallery-button').addEventListener('click', () => { closeAvatarSource(); els.avatarInput.click(); });
    $('#take-photo-button').addEventListener('click', () => { closeAvatarSource(); els.avatarCameraInput.click(); });
    $('#avatar-source-close').addEventListener('click', closeAvatarSource);
    els.avatarSourceModal.querySelector('.modal-backdrop').addEventListener('click', closeAvatarSource);
    els.avatarInput.addEventListener('change', handleAvatarSelect);
    els.avatarCameraInput.addEventListener('change', handleAvatarSelect);
    els.cropSaveButton.addEventListener('click', uploadCroppedAvatar);
    $('#crop-cancel-button').addEventListener('click', closeCropModal);
    $('#avatar-crop-close').addEventListener('click', closeCropModal);
    els.avatarCropModal.querySelector('.modal-backdrop').addEventListener('click', closeCropModal);
    els.profileQrButton.addEventListener('click', showProfileQr);
    const moreButton = $('#profile-more-button'); const moreMenu = $('#profile-more-menu');
    moreButton.addEventListener('click', (event) => { event.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; moreButton.setAttribute('aria-expanded', String(!moreMenu.hidden)); });
    moreMenu.addEventListener('click', async (event) => { const action = event.target.closest('[data-profile-action]')?.dataset.profileAction; moreMenu.hidden = true; moreButton.setAttribute('aria-expanded', 'false'); if (action === 'share') await shareProfile(); if (action === 'copy') { try { await navigator.clipboard.writeText(profileUrl()); window.UI.showToast('تم نسخ رابط الملف الشخصي.', 'success'); } catch { window.UI.showToast(profileUrl(), 'success', 5000); } } });
    document.addEventListener('click', (event) => { if (!moreMenu.contains(event.target) && event.target !== moreButton) { moreMenu.hidden = true; moreButton.setAttribute('aria-expanded', 'false'); } });
    els.profileShareButton.addEventListener('click', shareProfile);
    $('#profile-qr-close').addEventListener('click', closeProfileQr);
    els.profileQrModal.querySelector('.modal-backdrop').addEventListener('click', closeProfileQr);
    $('#profile-qr-share').addEventListener('click', shareProfile);
    $('#profile-qr-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(profileUrl()); window.UI.showToast('تم نسخ رابط الملف الشخصي.', 'success'); } catch { window.UI.showToast(profileUrl(), 'success', 5000); } });
    els.avatarHistoryBtn?.addEventListener('click', openAvatarHistory);
    els.avatarHistoryClose?.addEventListener('click', () => { els.avatarHistoryModal.hidden = true; });
    els.avatarHistoryModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => { els.avatarHistoryModal.hidden = true; });

    // Remove avatar
    const removeAvatarBtn = document.getElementById('remove-avatar-btn');
    removeAvatarBtn?.addEventListener('click', removeCurrentAvatar);

    // Privacy
    els.privacyLastSeen?.addEventListener('change', () => onPrivacyChange('last_seen_visibility', els.privacyLastSeen.value));
    els.privacyGroups?.addEventListener('change', () => onPrivacyChange('group_add_policy', els.privacyGroups.value));

    // Change password
    els.changePasswordForm?.addEventListener('submit', onChangePassword);

    // Delete account
    els.deleteAccountBtn?.addEventListener('click', openDeleteAccountModal);
    els.deleteAccountCancel?.addEventListener('click', closeDeleteAccountModal);
    els.deleteAccountConfirm?.addEventListener('input', () => {
      els.deleteAccountSubmit.disabled = els.deleteAccountConfirm.value.trim().toLowerCase() !== 'حذف';
    });
    els.deleteAccountSubmit?.addEventListener('click', onDeleteAccountConfirm);
    els.deleteAccountModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeDeleteAccountModal);

    // Profile view modal
    els.profileViewClose?.addEventListener('click', () => { els.profileViewModal.hidden = true; });
    els.profileViewModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => { els.profileViewModal.hidden = true; });

    // Chat profile button
    $('#chat-profile-button').addEventListener('click', () => {
      if (state.activeId) openUserProfile(state.activeId);
    });
    $$('.folder-tab').forEach((tab) => tab.addEventListener('click', () => {
      state.folder = tab.dataset.folder;
      $$('.folder-tab').forEach((item) => item.classList.toggle('active', item === tab));
      renderChats();
    }));
    els.chatsList.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.chat-row'); if (!row) return;
      event.preventDefault();
      const name = row.querySelector('.chat-row-name')?.textContent || '';
      const contact = [...state.contacts.values()].find((c) => getDisplayName(c) === name);
      if (!contact) return;
      const wasActive = state.activeId === contact.id;
      const pin = state.prefs[contact.id]?.pinned;
      const mute = state.prefs[contact.id]?.muted;
      const archive = state.prefs[contact.id]?.archived;
      const actions = [
        { label: pin ? 'إلغاء التثبيت' : 'تثبيت', icon: pin ? 'pin' : 'pin', run: () => togglePref({ pinned: !pin }) },
        { label: mute ? 'إلغاء الإسكات' : 'إسكات', icon: mute ? 'bell' : 'bell-off', run: () => togglePref({ muted: !mute }) },
        { label: archive ? 'إخراج من الأرشيف' : 'أرشفة', icon: archive ? 'archive' : 'archive', run: () => togglePref({ archived: !archive }) },
      ];
      if (wasActive) actions.push(
        { label: 'تثبيت المحادثة الحالية', icon: 'pin', run: () => togglePref({ pinned: !pin }) },
        { label: 'إسكات المحادثة الحالية', icon: 'bell-off', run: () => togglePref({ muted: !mute }) },
      );
      menu.replaceChildren();
      for (const action of actions) {
        const button = document.createElement('button'); button.type = 'button';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ic');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `assets/icons.svg#i-${action.icon}`);
        svg.append(use);
        const label = document.createElement('span'); label.textContent = action.label;
        button.append(svg, label);
        button.addEventListener('click', () => { closeMenu(); action.run(); });
        menu.append(button);
      }
      menu.hidden = false;
      menu.style.left = `${Math.min(event.clientX, innerWidth - 200)}px`;
      menu.style.top = `${Math.min(event.clientY, innerHeight - 240)}px`;
    });
    document.addEventListener('click', (event) => { if (!menu.hidden && !menu.contains(event.target)) closeMenu(); });
    $$('[data-nav]').forEach((item) => item.addEventListener('click', () => item.dataset.nav === 'settings' ? openSettings() : showPanel(item.dataset.nav)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeAvatarSource(); closeCropModal(); closeProfileQr(); } });
    $('#compose-fab').addEventListener('click', showSearch);
    $('#top-search-button').addEventListener('click', showSearch);
    $('#close-search-panel').addEventListener('click', showChats);
    document.querySelectorAll('[data-open-search]').forEach((button) => button.addEventListener('click', showSearch));
    $('#brand-home').addEventListener('click', (event) => { event.preventDefault(); window.UI.closeChatLayout(); showPanel('chats'); });
    $('#chat-profile-button').addEventListener('click', () => window.UI.showToast('ملف الشخص قريباً.'));
    $('#scroll-down').addEventListener('click', () => window.UI.scrollToBottom());
    $('#cancel-reply').addEventListener('click', window.UI.hideReply);
    document.querySelector('#back-to-list').addEventListener('click', window.UI.closeChatLayout);
    document.querySelector('#composer').addEventListener('submit', submitMessage);
    els.messageInput.addEventListener('input', inputTyping);
    els.messageInput.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); els.composer.requestSubmit(); } });
    els.conversationFilter.addEventListener('input', renderChats);
    els.peopleQuery.addEventListener('input', scheduleSearch);
    els.clearPeopleSearch.addEventListener('click', () => { els.peopleQuery.value = ''; els.peopleQuery.focus(); runSearch(); });
    els.searchResults.addEventListener('click', (event) => { const button = event.target.closest('[data-add-contact]'); if (button && !button.disabled) addContact(Number(button.dataset.addContact), button); });
    els.loadOlder.addEventListener('click', loadOlderMessages);
    els.messagesContainer.addEventListener('scroll', () => { if (els.messagesContainer.scrollTop < 40 && state.hasMore) loadOlderMessages(); }, { passive: true });
    document.querySelector('#chat-search-button').addEventListener('click', () => window.UI.appendSearchMessage());
    document.querySelector('#voice-call-button').addEventListener('click', () => startCall('audio'));
    document.querySelector('#video-call-button').addEventListener('click', () => startCall('video'));
    document.querySelector('#accept-call-button').addEventListener('click', () => answerCall(true));
    document.querySelector('#reject-call-button').addEventListener('click', () => answerCall(false));
    document.querySelector('#hangup-call-button').addEventListener('click', () => hangupCall(true));
    document.querySelector('#mute-call-button').addEventListener('click', toggleMute);
    document.querySelector('#camera-call-button').addEventListener('click', toggleCamera);
    document.querySelector('#close-chat-search').addEventListener('click', window.UI.closeSearchMessage);
    els.chatSearchInput.addEventListener('input', () => window.UI.highlightMessages(els.chatSearchInput.value));
    document.querySelector('#chat-more-button').addEventListener('click', () => window.UI.showToast('المحادثات تُدار من قائمة جهات الاتصال.'));
    document.querySelector('#emoji-button').addEventListener('click', toggleStickers);
    document.querySelector('#attach-button').addEventListener('click', () => { if (!currentContact()) { window.UI.showToast('اختر محادثة أولاً لإرسال الملفات.', 'error'); return; } els.fileInput.click(); });
    els.fileInput.addEventListener('change', () => handleFiles(els.fileInput.files));
    els.cancelUpload.addEventListener('click', window.API.cancelUpload);
    els.closeStickers.addEventListener('click', closeStickers);
    document.addEventListener('click', (event) => {
      if (els.stickerPanel.hidden) return;
      if (els.stickerPanel.contains(event.target) || event.target.closest('#emoji-button')) return;
      closeStickers();
    });
    els.messageInput.addEventListener('paste', (event) => {
      const files = [...(event.clipboardData?.files || [])];
      if (!files.length) return;
      event.preventDefault();
      handleFiles(files);
    });
    els.installButton.addEventListener('click', window.UI.installApp);
    window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); window.UI.setInstallPrompt(event); });
    window.addEventListener('appinstalled', () => window.UI.setInstallPrompt(null));
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (els.messengerScreen.hidden) return; showSearch(); }
      if (event.key === 'Escape') { if (!els.stickerPanel.hidden) closeStickers(); else if (!els.chatSearchBar.hidden) window.UI.closeSearchMessage(); else if (els.messengerScreen.classList.contains('chat-open')) window.UI.closeChatLayout(); }
    });
  }
  async function loadSocketScript() {
    const script = document.createElement('script'); script.src = window.APP_CONFIG.socketScriptUrl; script.async = true;
    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = () => reject(new Error('تعذّر تحميل عميل Socket.IO من الخادم.')); document.head.append(script); });
  }
  async function start() {
    restoreTheme(); setupEvents(); state.authMode = 'login'; window.UI.authMode(false);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    try { await loadSocketScript(); }
    catch (error) { console.warn(error); }
    let user = null;
    try { user = JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { localStorage.removeItem(USER_KEY); }
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && user?.id && user?.username) { await bootSession(user); return; }
    window.UI.showAuth(false);
  }

  start();
})();
