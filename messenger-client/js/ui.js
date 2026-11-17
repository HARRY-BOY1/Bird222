(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const els = {
    authScreen: $('#auth-screen'), messengerScreen: $('#messenger-screen'), authTitle: $('#auth-title'), authForm: $('#auth-form'),
    authUsername: $('#auth-username'), authPassword: $('#auth-password'), authSubmit: $('#auth-submit'), authError: $('#auth-error'),
    loginTab: $('#login-tab'), registerTab: $('#register-tab'),
    listScreen: $('#list-screen'), chatsPanel: $('#chats-panel'), searchPanel: $('#search-panel'), contactsPanel: $('#contacts-panel'),
    callsPanel: $('#calls-panel'), settingsPanel: $('#settings-panel'),
    chatsList: $('#chats-list'), chatsEmpty: $('#chats-empty'), chatsFilterEmpty: $('#chats-filter-empty'), chatsTotal: $('#chats-total'),
    chatsSkeleton: $('#chats-skeleton'), contactsList: $('#contacts-list'), contactsEmpty: $('#contacts-empty'),
    callsList: $('#calls-list'), callsEmpty: $('#calls-empty'),
    conversationFilter: $('#conversation-filter'), peopleQuery: $('#people-query'), searchResults: $('#search-results'), clearPeopleSearch: $('#clear-people-search'),
    connectionBanner: $('#connection-banner'), connectionStatus: $('#connection-status'),
    chatPane: $('#chat-pane'), welcomeView: $('#welcome-view'), activeChat: $('#active-chat'), chatAvatar: $('#chat-avatar'),
    chatUsername: $('#chat-username'), chatPresence: $('#chat-presence'), messageList: $('#message-list'), messagesContainer: $('#messages-container'),
    loadOlder: $('#load-older'), typingIndicator: $('#typing-indicator'), typingLabel: $('#typing-label'), composer: $('#composer'),
    messageInput: $('#message-input'), chatSearchBar: $('#chat-search-bar'), chatSearchInput: $('#chat-search-input'), chatSearchCount: $('#chat-search-count'),
    replyBar: $('#reply-bar'), replyPreview: $('#reply-preview'), scrollDown: $('#scroll-down'), scrollUnread: $('#scroll-unread'),
    toast: $('#toast'), installButton: $('#install-button'), fab: $('#compose-fab'),
    drawer: $('#drawer'), backdrop: $('#drawer-backdrop'), drawerName: $('#drawer-name'), drawerUsername: $('#drawer-username'), drawerAvatar: $('#drawer-avatar'),
    settingsName: $('#settings-name'), settingsUsername: $('#settings-username'), settingsAvatar: $('#settings-avatar'),
    profileForm: $('#profile-form'), profileDisplayName: $('#profile-display-name'), profileUsername: $('#profile-username'),
    profileBio: $('#profile-bio'), profileHint: $('#profile-hint'), languageSelect: $('#language-select'),
    themeButton: $('#theme-button'), drawerThemeIcon: $('#drawer-theme-icon'), settingsThemeIcon: $('#settings-theme-icon'),
    logoutButton: $('#logout-button'), currentUsername: $('#current-username'), currentAvatar: $('#current-avatar'),
    callLayer: $('#call-layer'), callName: $('#call-name'), callKindLabel: $('#call-kind-label'), callStatus: $('#call-status'), callTimer: $('#call-timer'),
    callVideoArea: $('#call-video-area'), remoteVideo: $('#remote-video'), localVideo: $('#local-video'),
    acceptCallButton: $('#accept-call-button'), rejectCallButton: $('#reject-call-button'), hangupCallButton: $('#hangup-call-button'),
    muteCallButton: $('#mute-call-button'), cameraCallButton: $('#camera-call-button'),
    attachButton: $('#attach-button'), fileInput: $('#file-input'), uploadStatus: $('#upload-status'),
    uploadName: $('#upload-name'), uploadFill: $('#upload-fill'), cancelUpload: $('#cancel-upload'),
    stickerPanel: $('#sticker-panel'), stickerGrid: $('#sticker-grid'), closeStickers: $('#close-stickers'),
  };
  let toastTimer, installPrompt = null, callPeer = null, localStream = null, callSeconds = 0, callTick = null;

  const initials = (name = '?') => [...name.trim()][0]?.toLocaleUpperCase('ar') || '?';
  const avatarColor = (id) => `avatar-color-${(Number(id) % 4) + 1}`;
  function time(value) {
    if (!value) return '';
    const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat('ar-IQ', { hour: 'numeric', minute: '2-digit' }).format(date);
    if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat('ar-IQ', { day: 'numeric', month: 'short' }).format(date);
    return new Intl.DateTimeFormat('ar-IQ', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
  }
  function dayLabel(value) {
    const date = new Date(value); if (Number.isNaN(date.getTime())) return '';
    const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'اليوم';
    if (date.toDateString() === yesterday.toDateString()) return 'أمس';
    return new Intl.DateTimeFormat('ar-IQ', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  }
  function showToast(text, kind = '', duration = 2800) {
    els.toast.textContent = text; els.toast.className = `toast ${kind}`; els.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { els.toast.hidden = true; }, duration);
  }
  function authMode(register) {
    els.authTitle.textContent = register ? 'أنشئ حسابك' : 'أهلاً بعودتك';
    els.authSubmit.textContent = register ? 'إنشاء الحساب' : 'دخول';
    els.authPassword.autocomplete = register ? 'new-password' : 'current-password';
    els.loginTab.classList.toggle('active', !register); els.registerTab.classList.toggle('active', register);
    els.loginTab.setAttribute('aria-selected', String(!register)); els.registerTab.setAttribute('aria-selected', String(register));
    els.authError.hidden = true; els.authError.textContent = '';
  }
  function showAuth(register = false) { els.authScreen.hidden = false; els.messengerScreen.hidden = true; authMode(register); }
  function showMessenger(user) {
    els.authScreen.hidden = true; els.messengerScreen.hidden = false;
    els.drawerName.textContent = user.display_name || user.username;
    els.drawerUsername.textContent = `@${user.username}`;
    els.drawerAvatar.textContent = initials(user.username);
    els.settingsName.textContent = user.display_name || user.username;
    els.settingsUsername.textContent = `@${user.username}`;
    els.profileDisplayName.value = user.display_name || '';
    els.profileUsername.value = user.username;
    els.profileBio.value = user.bio || '';
  }
  function setAuthError(message) { els.authError.textContent = message; els.authError.hidden = !message; }

  function setPanel(name) {
    for (const [key, panel] of Object.entries({ chats: els.chatsPanel, contacts: els.contactsPanel, calls: els.callsPanel, settings: els.settingsPanel, search: els.searchPanel })) panel.hidden = key !== name;
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.nav === name));
    els.fab.hidden = name === 'settings' || name === 'calls';
  }
  function setSearchTab(searching) { setPanel(searching ? 'search' : 'chats'); if (searching) els.peopleQuery.focus(); }

  function chatRow(chat, currentUserId, activeId, onOpen) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `chat-row${chat.id === activeId ? ' active' : ''}`;
    button.setAttribute('aria-label', `محادثة ${chat.username}`);
    const avatar = document.createElement('span'); avatar.className = `avatar ${avatarColor(chat.id)}`; avatar.textContent = initials(chat.username);
    const dot = document.createElement('i'); dot.className = `avatar-status${chat.online ? ' online' : ''}`; avatar.append(dot);
    const body = document.createElement('span'); body.className = 'chat-row-body';
    const top = document.createElement('span'); top.className = 'chat-row-top';
    const name = document.createElement('strong'); name.className = 'chat-row-name'; name.textContent = chat.display_name || chat.username;
    const date = document.createElement('span'); date.className = 'chat-row-time'; date.textContent = time(chat.lastMessage?.created_at || chat.created_at);
    top.append(name, date);
    const bottom = document.createElement('span'); bottom.className = 'chat-row-bottom';
    const preview = document.createElement('span'); preview.className = 'chat-row-preview';
    if (chat.lastMessage?.sender_id === currentUserId) preview.append(document.createTextNode('أنت: '));
    const last = chat.lastMessage;
    const kindLabel = !last ? '' : ({ image: 'صورة', video: 'فيديو', audio: 'مقطع صوتي', sticker: 'ملصق' }[last.kind] || (last.kind === 'file' ? (last.attachment_name || 'ملف') : ''));
    preview.append(document.createTextNode(last?.text || kindLabel || last?.preview || 'ابدأ المحادثة'));
    bottom.append(preview);
    if (chat.unread > 0) { const badge = document.createElement('span'); badge.className = 'unread-badge'; badge.textContent = chat.unread > 99 ? '99+' : String(chat.unread); bottom.append(badge); }
    body.append(top, bottom); button.append(avatar, body); button.addEventListener('click', () => onOpen(chat));
    return button;
  }
  function renderChats(chats, currentUserId, activeId, filter, onOpen) {
    const query = (filter || '').trim().toLocaleLowerCase();
    const filtered = chats.filter((chat) => (chat.username || '').toLocaleLowerCase().includes(query));
    els.chatsList.replaceChildren();
    els.chatsTotal.textContent = String(chats.length);
    els.chatsEmpty.hidden = chats.length > 0;
    els.chatsFilterEmpty.hidden = chats.length === 0 || filtered.length > 0;
    let unread = 0;
    for (const chat of filtered) { unread += chat.unread || 0; els.chatsList.append(chatRow(chat, currentUserId, activeId, onOpen)); }
    updateUnread(unread);
  }
  function updateUnread(total) {
    const badge = $('#nav-unread'); badge.textContent = total > 99 ? '99+' : String(total); badge.hidden = total < 1;
    document.title = total > 0 ? `(${total}) Bird` : 'Bird — رسائلك';
  }
  function renderContacts(contacts, onOpen) {
    els.contactsList.replaceChildren();
    els.contactsEmpty.hidden = contacts.length > 0;
    for (const contact of contacts) els.contactsList.append(chatRow(contact, null, null, onOpen));
  }
  function renderCalls(calls, onCall) {
    els.callsList.replaceChildren();
    els.callsEmpty.hidden = calls.length > 0;
    for (const call of calls) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'chat-row';
      const avatar = document.createElement('span'); avatar.className = `avatar ${avatarColor(call.peerId)}`; avatar.textContent = initials(call.name);
      const body = document.createElement('span'); body.className = 'chat-row-body';
      const top = document.createElement('span'); top.className = 'chat-row-top';
      const name = document.createElement('strong'); name.className = 'chat-row-name'; name.textContent = call.name;
      const date = document.createElement('span'); date.className = 'chat-row-time'; date.textContent = time(call.at);
      top.append(name, date);
      const bottom = document.createElement('span'); bottom.className = 'chat-row-bottom';
      const preview = document.createElement('span'); preview.className = 'chat-row-preview';
      preview.textContent = `${call.direction === 'out' ? '←' : '→'} ${call.kind === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية'} · ${call.result}`;
      bottom.append(preview);
      const icon = document.createElement('span'); icon.style.color = call.result === 'missed' ? '#d64550' : 'var(--blue)';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ic');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `assets/icons.svg#i-${call.kind === 'video' ? 'video' : 'phone'}`);
      svg.append(use); icon.append(svg); bottom.append(icon);
      body.append(top, bottom); row.append(avatar, body); row.addEventListener('click', () => onCall(call));
      els.callsList.append(row);
    }
  }
  function setChatHeader(user, online) {
    els.chatUsername.textContent = user.display_name || user.username;
    els.chatAvatar.textContent = initials(user.username);
    els.chatAvatar.className = `avatar ${avatarColor(user.id)}`;
    els.chatPresence.textContent = online ? 'متصل الآن' : (user.last_seen ? `آخر ظهور ${time(user.last_seen)}` : 'غير متصل');
    els.chatPresence.classList.toggle('online', online);
  }
  function showWelcome() { els.welcomeView.hidden = false; els.activeChat.hidden = true; els.chatSearchBar.hidden = true; }
  function showChat() { els.welcomeView.hidden = true; els.activeChat.hidden = false; }
  function openChatLayout() { els.messengerScreen.classList.add('chat-open'); }
  function closeChatLayout() { els.messengerScreen.classList.remove('chat-open'); }
  function scrollToBottom(smooth = true) { els.messagesContainer.scrollTo({ top: els.messagesContainer.scrollHeight, behavior: smooth ? 'smooth' : 'instant' }); }
  function iconSvg(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ic');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `assets/icons.svg#${name}`);
    svg.append(use);
    return svg;
  }
  function humanSize(bytes) {
    if (!bytes) return '';
    const units = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت'];
    let value = Number(bytes);
    let index = 0;
    while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
    return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
  }
  function openImageViewer(src) {
    const layer = document.createElement('div');
    layer.className = 'image-viewer';
    const image = document.createElement('img');
    image.src = src; image.alt = 'صورة';
    const close = document.createElement('button');
    close.type = 'button'; close.setAttribute('aria-label', 'إغلاق');
    close.append(iconSvg('i-x'));
    const dismiss = () => layer.remove();
    close.addEventListener('click', dismiss);
    layer.addEventListener('click', (event) => { if (event.target === layer) dismiss(); });
    document.addEventListener('keydown', function onKey(event) { if (event.key === 'Escape') { dismiss(); document.removeEventListener('keydown', onKey); } });
    layer.append(image, close);
    document.body.append(layer);
  }
  function buildAttachment(message) {
    const url = window.API.fileUrl(message.attachment_id);
    const name = message.attachment_name || 'ملف';
    const kind = message.kind || 'text';
    if (kind === 'image') {
      const image = document.createElement('img');
      image.className = 'message-media msg-image';
      image.src = url; image.alt = name; image.loading = 'lazy';
      image.addEventListener('click', () => openImageViewer(url));
      return image;
    }
    if (kind === 'video') {
      const video = document.createElement('video');
      video.className = 'message-media msg-video';
      video.src = url; video.controls = true; video.preload = 'metadata'; video.playsInline = true;
      return video;
    }
    if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.className = 'msg-audio'; audio.src = url; audio.controls = true; audio.preload = 'metadata';
      return audio;
    }
    const link = document.createElement('a');
    link.className = 'message-file'; link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.download = name;
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.append(iconSvg('i-download'));
    const meta = document.createElement('span');
    meta.className = 'file-meta';
    const title = document.createElement('strong'); title.textContent = name;
    const size = document.createElement('small'); size.textContent = humanSize(message.attachment_size);
    meta.append(title, size);
    link.append(icon, meta);
    return link;
  }
  function createMessageRow(message, currentUserId, onContext) {
    const mine = Number(message.sender_id) === Number(currentUserId);
    const row = document.createElement('article'); row.className = `message-row ${mine ? 'mine' : 'theirs'}`; row.dataset.messageId = String(message.id);
    if (!mine) { const avatar = document.createElement('span'); avatar.className = `avatar message-avatar ${avatarColor(message.sender_id)}`; avatar.textContent = initials(els.chatUsername.textContent); row.append(avatar); }
    const bubble = document.createElement('div'); bubble.className = 'message-bubble';
    if (message.reply || message.reply_to) {
      const quote = document.createElement('span'); quote.className = 'message-reply-quote';
      const reply = message.reply || {};
      quote.textContent = `${reply.sender_id ? (Number(reply.sender_id) === Number(currentUserId) ? 'أنت' : els.chatUsername.textContent) : 'رد'}: ${(reply.text || '').slice(0, 90)}`;
      bubble.append(quote);
    }
    const kind = message.kind || 'text';
    if (kind === 'sticker' && message.sticker) {
      row.classList.add('sticker');
      const sticker = document.createElement('img');
      sticker.className = 'message-sticker';
      sticker.src = `assets/stickers/${String(message.sticker).replace(/[^a-zA-Z0-9_-]/g, '')}.svg`;
      sticker.alt = 'ملصق'; sticker.loading = 'lazy';
      bubble.append(sticker);
    } else if (kind !== 'text' && message.attachment_id) {
      bubble.append(buildAttachment(message));
    }
    const text = document.createElement('span'); text.className = 'message-text'; text.textContent = message.text || '';
    if (message.deleted) text.classList.add('deleted-text');
    const meta = document.createElement('span'); meta.className = 'message-meta';
    if (message.edited_at) { const edited = document.createElement('span'); edited.className = 'edited-label'; edited.textContent = 'معدّلة'; meta.append(edited); }
    if (message.reaction) { const react = document.createElement('span'); react.className = 'message-reaction'; react.textContent = message.reaction; meta.append(react); }
    const t = document.createElement('time'); t.dateTime = message.created_at; t.textContent = time(message.created_at); meta.append(t);
    if (mine) {
      const ticks = document.createElement('span'); ticks.className = 'message-ticks';
      const status = message.status || 'sent';
      ticks.textContent = status === 'pending' ? '◌' : status === 'sent' ? '✓' : '✓✓';
      ticks.classList.toggle('read', status === 'read');
      ticks.setAttribute('aria-label', status);
      meta.append(ticks);
    }
    bubble.append(text, meta); row.append(bubble);
    if (onContext) {
      row.addEventListener('contextmenu', (event) => { event.preventDefault(); onContext(event, message, mine); });
      let timer = null;
      row.addEventListener('touchstart', () => { timer = setTimeout(() => onContext(null, message, mine), 550); }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach((name) => row.addEventListener(name, () => clearTimeout(timer), { passive: true }));
      row.addEventListener('dblclick', () => onContext(null, message, mine));
    }
    return row;
  }
  function groupMessages() {
    const rows = $$('.message-row', els.messageList);
    rows.forEach((row, index) => {
      const prev = rows[index - 1];
      const same = prev && prev.classList.contains(row.classList.contains('mine') ? 'mine' : 'theirs') && prev.querySelector('time')?.textContent === row.querySelector('time')?.textContent;
      row.classList.toggle('grouped', Boolean(same));
      if (same) row.querySelector('.avatar')?.remove();
    });
  }
  function appendMessages(messages, currentUserId, prepend, onContext) {
    if (!messages.length) return;
    const fragment = document.createDocumentFragment(); let lastDay = '';
    for (const message of messages) {
      const day = new Date(message.created_at).toDateString();
      if (day !== lastDay) { const divider = document.createElement('div'); divider.className = 'date-divider'; divider.textContent = dayLabel(message.created_at); fragment.append(divider); }
      lastDay = day; fragment.append(createMessageRow(message, currentUserId, onContext));
    }
    if (prepend) {
      const height = els.messagesContainer.scrollHeight;
      const existing = $('.message-row', els.messageList);
      if (existing && $('.date-divider', fragment) && new Date(messages.at(-1)?.created_at).toDateString() === new Date(existing.dataset.id ? '' : '').toDateString()) { /* no-op */ }
      els.messageList.prepend(fragment);
      els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight - height;
    } else els.messageList.append(fragment);
    groupMessages();
  }
  function renderMessages(messages, currentUserId, onContext) { els.messageList.replaceChildren(); appendMessages(messages, currentUserId, false, onContext); }
  function prependOlder(messages, currentUserId, onContext) { appendMessages(messages, currentUserId, true, onContext); }
  function addMessage(message, currentUserId, onContext) {
    const exists = els.messageList.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`);
    if (exists) { exists.remove(); }
    appendMessages([message], currentUserId, false, onContext); scrollToBottom();
  }
  function findMessageRow(id) { return els.messageList.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`); }
  function setMessageEdited(id, text, editedAt) {
    const row = findMessageRow(id); if (!row) return;
    const body = row.querySelector('.message-text'); if (body) body.textContent = text;
    if (!row.querySelector('.edited-label')) {
      const meta = row.querySelector('.message-meta');
      const label = document.createElement('span'); label.className = 'edited-label'; label.textContent = 'معدّلة';
      meta?.prepend(label);
    }
  }
  function setMessageReaction(id, reaction) {
    const row = findMessageRow(id); if (!row) return;
    row.querySelector('.message-reaction')?.remove();
    const meta = row.querySelector('.message-meta');
    if (reaction && meta) {
      const label = document.createElement('span'); label.className = 'message-reaction'; label.textContent = reaction;
      meta.prepend(label);
    }
  }
  function removeMessage(id) { findMessageRow(id)?.remove(); groupMessages(); }
  function updateMessageStatus(id, status) {
    const row = els.messageList.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);
    const ticks = row?.querySelector('.message-ticks'); if (!ticks) return;
    ticks.textContent = status === 'pending' ? '◌' : status === 'sent' ? '✓' : '✓✓';
    ticks.classList.toggle('read', status === 'read');
  }
  function setTyping(visible, name = '') { els.typingIndicator.hidden = !visible; els.typingLabel.textContent = name ? `${name} يكتب...` : 'يكتب...'; if (visible) scrollToBottom(); }
  function setOlderAvailable(value) { els.loadOlder.hidden = !value; }
  function setConnection(status, label) {
    els.connectionBanner.hidden = false;
    els.connectionStatus.className = `connection-status ${status}`;
    $('span:last-child', els.connectionStatus).textContent = label;
  }
  function renderPeople(users, contactIds, { loading = false, error = '' } = {}) {
    els.searchResults.replaceChildren();
    if (loading) { const p = document.createElement('p'); p.className = 'loading-line'; p.textContent = 'جارٍ البحث...'; els.searchResults.append(p); return; }
    if (error) { const p = document.createElement('p'); p.className = 'no-results'; p.textContent = error; els.searchResults.append(p); return; }
    if (!users.length) { const p = document.createElement('p'); p.className = 'no-results'; p.textContent = els.peopleQuery.value.trim() ? 'لا يوجد حساب بهذا الاسم.' : 'ابحث باسم المستخدم للعثور على أصدقائك.'; els.searchResults.append(p); return; }
    for (const user of users) {
      const row = document.createElement('div'); row.className = 'search-person';
      const avatar = document.createElement('span'); avatar.className = `avatar ${avatarColor(user.id)}`; avatar.textContent = initials(user.username);
      const info = document.createElement('span'); info.className = 'search-person-info';
      const name = document.createElement('strong'); name.textContent = user.display_name || user.username;
      const handle = document.createElement('small'); handle.textContent = `@${user.username}`;
      info.append(name, handle);
      const button = document.createElement('button'); button.className = 'add-contact-button'; button.type = 'button';
      button.dataset.addContact = String(user.id);
      const isContact = contactIds.has(Number(user.id));
      button.textContent = isContact ? 'ضمن جهاتك ✓' : '＋ إضافة'; button.disabled = isContact;
      row.append(avatar, info, button); els.searchResults.append(row);
    }
  }
  function appendSearchMessage() { els.chatSearchBar.hidden = false; els.chatSearchInput.focus(); }
  function closeSearchMessage() { els.chatSearchBar.hidden = true; els.chatSearchInput.value = ''; els.chatSearchCount.textContent = ''; }
  function highlightMessages(query) {
    const rows = $$('.message-row', els.messageList);
    rows.forEach((r) => r.classList.remove('message-highlight'));
    const q = query.trim().toLocaleLowerCase();
    const matches = q ? rows.filter((r) => r.querySelector('.message-text')?.textContent.toLocaleLowerCase().includes(q)) : [];
    if (matches[0]) { matches[0].classList.add('message-highlight'); matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    els.chatSearchCount.textContent = q ? `${matches.length} نتيجة` : '';
  }
  function showReply(text) { els.replyBar.hidden = false; els.replyPreview.textContent = text; }
  function hideReply() { els.replyBar.hidden = true; els.replyPreview.textContent = ''; }
  function setScrollButton(visible, unread = 0) { els.scrollDown.hidden = !visible; els.scrollUnread.textContent = unread > 0 ? String(unread) : ''; els.scrollUnread.hidden = unread < 1; }
  function openDrawer() { els.backdrop.hidden = false; els.drawer.classList.add('open'); els.drawer.focus(); }
  function closeDrawer() { els.backdrop.hidden = true; els.drawer.classList.remove('open'); }
  function setTheme(dark) {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    els.themeButton.setAttribute('aria-checked', String(dark));
    for (const icon of [els.drawerThemeIcon, els.settingsThemeIcon]) $('use', icon)?.setAttribute('href', `assets/icons.svg#i-${dark ? 'sun' : 'moon'}`);
  }
  function setInstallPrompt(prompt) { installPrompt = prompt; els.installButton.hidden = !prompt; }
  async function installApp() { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; els.installButton.hidden = true; }

  /* ---------------- Calls ---------------- */
  function callMode(kind) {
    const video = kind === 'video';
    els.callVideoArea.hidden = !video;
    $('#call-glyph').hidden = video;
    els.muteCallButton.hidden = false;
    els.cameraCallButton.hidden = !video;
  }
  function openCall({ name, kind, direction }) {
    callMode(kind); els.callName.textContent = name;
    els.callKindLabel.textContent = kind === 'video' ? 'مكالمة فيديو' : 'مكالمة صوتية';
    els.callStatus.textContent = direction === 'in' ? 'مكالمة واردة...' : 'جارٍ الاتصال...';
    els.callTimer.hidden = true; els.callTimer.textContent = '';
    els.acceptCallButton.hidden = direction !== 'in'; els.rejectCallButton.hidden = direction !== 'in';
    els.callLayer.hidden = false; if (localStream) els.localVideo.srcObject = localStream;
  }
  function incomingCall({ name, kind }) { openCall({ name, kind, direction: 'in' }); }
  function showActiveCall({ name, kind }) {
    callMode(kind); els.callName.textContent = name;
    els.acceptCallButton.hidden = true; els.rejectCallButton.hidden = true;
    els.callStatus.textContent = 'جارٍ الاتصال...';
  }
  function createCallPeer({ kind, localStream: stream, onIceCandidate, onRemoteStream, onPeerClosed }) {
    localStream = stream;
    callPeer = new RTCPeerConnection({ iceServers: window.APP_CONFIG.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }] });
    for (const track of stream.getTracks()) callPeer.addTrack(track, stream);
    callPeer.onicecandidate = (event) => { if (event.candidate) onIceCandidate(event.candidate.toJSON()); };
    callPeer.ontrack = (event) => onRemoteStream(event.streams[0]);
    callPeer.onconnectionstatechange = () => { if (['failed', 'closed'].includes(callPeer?.connectionState)) onPeerClosed(); };
    if (kind === 'video') els.localVideo.srcObject = stream;
    return callPeer;
  }
  function attachRemoteStream(stream) { els.remoteVideo.srcObject = stream; }
  function setCallConnected() {
    els.callStatus.textContent = 'متصل'; els.callTimer.hidden = false; callSeconds = 0; els.callTimer.textContent = '00:00';
    clearInterval(callTick);
    callTick = setInterval(() => {
      callSeconds += 1;
      els.callTimer.textContent = `${String(Math.floor(callSeconds / 60)).padStart(2, '0')}:${String(callSeconds % 60).padStart(2, '0')}`;
    }, 1000);
  }
  function setMuteVisual(muted) { els.muteCallButton.classList.toggle('off', muted); }
  function setCameraVisual(off) { els.cameraCallButton.classList.toggle('off', off); }
  function closeCallLayer() {
    clearInterval(callTick); callTick = null;
    if (callPeer) { try { callPeer.close(); } catch {} callPeer = null; }
    if (localStream) { for (const track of localStream.getTracks()) track.stop(); localStream = null; }
    els.remoteVideo.srcObject = null; els.localVideo.srcObject = null; els.callLayer.hidden = true;
    els.muteCallButton.classList.remove('off'); els.cameraCallButton.classList.remove('off');
    els.acceptCallButton.hidden = true; els.rejectCallButton.hidden = true;
  }

  window.UI = {
    els, initials, time, showToast, authMode, showAuth, showMessenger, setAuthError,
    renderChats, renderContacts, renderCalls, setPanel, setSearchTab, setChatHeader, updateUnread,
    showWelcome, showChat, openChatLayout, closeChatLayout, scrollToBottom, renderMessages, prependOlder,
    addMessage, updateMessageStatus, setMessageEdited, setMessageReaction, removeMessage, findMessageRow,
    setTyping, setOlderAvailable, setConnection, renderPeople,
    appendSearchMessage, closeSearchMessage, highlightMessages, showReply, hideReply, setScrollButton,
    openDrawer, closeDrawer, setTheme, setInstallPrompt, installApp,
    get callActive() { return !els.callLayer.hidden; },
    get callConnected() { return !els.callTimer.hidden; },
    openCall, incomingCall, showActiveCall, createCallPeer, attachRemoteStream, setCallConnected,
    setMuteVisual, setCameraVisual, closeCallLayer,
  };
})();
