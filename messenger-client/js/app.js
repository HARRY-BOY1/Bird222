(() => {
  const { els } = window.UI;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const TOKEN_KEY = 'messenger.jwt';
  const USER_KEY = 'messenger.user';
  const APP_STATE_KEY = 'messenger.state';
  const state = {
    user: null, contacts: new Map(), activeId: null, messages: new Map(),
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
    state.user = null; state.activeId = null; state.contacts.clear(); state.messages.clear(); state.online.clear();
    localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); localStorage.removeItem(APP_STATE_KEY);
    window.API.setToken(null);
    window.UI.showAuth(false);
  }
  function currentContact() { return state.activeId ? state.contacts.get(state.activeId) : null; }
  function showError(error) {
    if (error?.status === 401) { clearSession(); window.UI.showToast('انتهت صلاحية الجلسة. سجّل الدخول مرة ثانية.', 'error'); return; }
    window.UI.showToast(error?.message || 'صار خطأ غير متوقع.', 'error');
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
    window.UI.showMessenger(user);
    window.UI.setPanel('chats');
    try { state.calls = JSON.parse(localStorage.getItem('messenger.calls') || '[]'); } catch { state.calls = []; }
    window.API.getDrafts().then((drafts) => { state.drafts = drafts || {}; }).catch(() => {});
    window.UI.setConnection('', 'جارٍ الاتصال...');
    connectSocket();
    try { await loadContacts(); }
    catch (error) { showError(error); }
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
      });
    } catch (error) { window.UI.setConnection('error', error.message); }
  }
  function onPresence(event) {
    const id = Number(event.userId);
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
    let contact = state.contacts.get(senderId);
    if (!contact) {
      // The server sends ids but not usernames with messages; look up the sender for a useful label.
      contact = { id: senderId, username: `مستخدم ${senderId}`, created_at: message.created_at, last_seen: null, lastMessage: message, unread: 1, online: state.online.has(senderId) };
      state.contacts.set(senderId, contact);
      persistState(); renderChats();
      window.API.searchUsers(String(senderId)).then((users) => {
        const sender = users.find((user) => Number(user.id) === senderId);
        if (sender && state.contacts.has(senderId)) {
          Object.assign(contact, sender);
          persistState(); renderChats();
          if (state.activeId === senderId) window.UI.setChatHeader(contact, state.online.has(senderId));
        }
      }).catch(() => {});
      return;
    }
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
    window.callController = { callId, peerId: contact.id, peerName: contact.username, kind, direction: 'out', peer, stream, remoteDescriptionSet: false, pendingCandidates: [] };
    window.UI.openCall({ name: contact.username, kind, direction: 'out' });
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
      callId: event.callId, peerId: Number(event.from), peerName: event.username,
      kind: event.kind === 'video' ? 'video' : 'audio', direction: 'in', pendingOffer: null, pendingCandidates: [], remoteDescriptionSet: false,
    };
    window.UI.incomingCall({ name: event.username, kind: event.kind });
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
    const data = { bio: els.profileBio.value.trim() || null };
    if (els.profileDisplayName.value.trim()) data.display_name = els.profileDisplayName.value.trim();
    if (els.profileUsername.value.trim()) data.username = els.profileUsername.value.trim();
    try {
      const user = await window.API.updateProfile(data);
      state.user = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      window.UI.showMessenger(user);
      window.UI.showToast('تم حفظ الملف الشخصي.', 'success');
    } catch (error) { window.UI.showToast(error.message, 'error'); }
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
      window.UI.showToast(`أضفت ${contact.username} إلى جهاتك`, 'success');
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
    window.UI.setTheme(theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function setupEvents() {
    els.loginTab.addEventListener('click', () => { state.authMode = 'login'; window.UI.authMode(false); });
    els.registerTab.addEventListener('click', () => { state.authMode = 'register'; window.UI.authMode(true); });
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
      if (action === 'settings') return showPanel('settings');
      if (action === 'invite') { const link = `${location.origin}/u/${state.user?.username || ''}`; navigator.clipboard?.writeText(link).catch(() => {}); window.UI.showToast('تم نسخ رابط الدعوة.', 'success'); return; }
      if (action === 'saved') { openSavedMessages(); return; }
      window.UI.showToast('ستتوفر هذه الميزة قريباً.');
    }));
    $$('.folder-tab').forEach((tab) => tab.addEventListener('click', () => {
      state.folder = tab.dataset.folder;
      $$('.folder-tab').forEach((item) => item.classList.toggle('active', item === tab));
      renderChats();
    }));
    els.chatsList.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.chat-row'); if (!row) return;
      event.preventDefault();
      const name = row.querySelector('.chat-row-name')?.textContent || '';
      const contact = [...state.contacts.values()].find((c) => c.username === name || c.display_name === name);
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
    $$('[data-nav]').forEach((item) => item.addEventListener('click', () => showPanel(item.dataset.nav)));
    $('#compose-fab').addEventListener('click', showSearch);
    $('#top-search-button').addEventListener('click', showSearch);
    $('#close-search-panel').addEventListener('click', showChats);
    document.querySelectorAll('[data-open-search]').forEach((button) => button.addEventListener('click', showSearch));
    $('#brand-home').addEventListener('click', (event) => { event.preventDefault(); window.UI.closeChatLayout(); showPanel('chats'); });
    $('#chat-profile-button').addEventListener('click', () => window.UI.showToast('ملف الشخص قريباً.'));
    $('#profile-form').addEventListener('submit', saveProfile);
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
