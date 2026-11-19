/* Bird — واجهة مراسلة تعمل مع خادم Express + Socket.IO + JWT الحالي.
   كل ما يخص شكل بيانات الخادم موجود في قسم "Adapter" أدناه؛ عدّله إذا اختلفت أسماء الحقول. */
(function () {
  "use strict";

  /* ========== الإعدادات والتخزين ========== */
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const DEFAULT_URL = (window.BIRD_CONFIG && window.BIRD_CONFIG.SERVER_URL) || "";
  const serverUrl = () => (LS.get("bird.server", DEFAULT_URL) || DEFAULT_URL).replace(/\/+$/, "");

  const S = {
    token: LS.get("bird.token", null),
    me: LS.get("bird.me", null),
    contacts: [],
    active: null,          // المستخدم المفتوح
    msgs: {},              // userId -> [message]
    unread: {},
    online: new Set(),
    typing: {},            // userId -> timeout
    socket: null,
    theme: LS.get("bird.theme", "light"),
    notify: LS.get("bird.notify", false)
  };

  /* ========== Adapter: تحويل بيانات الخادم إلى شكل موحّد ========== */
  const pick = (o, keys, d) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return d; };
  const absUrl = (u) => !u ? "" : /^(https?:|data:|blob:)/.test(u) ? u : serverUrl() + (u.startsWith("/") ? "" : "/") + u;

  function normUser(u) {
    if (!u) return null;
    return {
      id: pick(u, ["id", "user_id", "userId"]),
      username: pick(u, ["username", "user_name", "handle"], ""),
      name: pick(u, ["display_name", "displayName", "name", "full_name", "username"], "مستخدم"),
      bio: pick(u, ["bio", "about", "status_text"], ""),
      avatar: absUrl(pick(u, ["avatar_url", "avatarUrl", "avatar", "photo"], "")),
      online: !!pick(u, ["online", "is_online"], false),
      last: pick(u, ["last_message", "lastMessage"], null),
      unread: pick(u, ["unread", "unread_count", "unreadCount"], 0)
    };
  }
  function normMsg(m) {
    if (!m) return null;
    const file = pick(m, ["file_url", "fileUrl", "attachment", "file", "media_url", "url"], "");
    return {
      id: pick(m, ["id", "message_id", "_id"]),
      tempId: pick(m, ["tempId", "temp_id", "clientId"], null),
      from: pick(m, ["sender_id", "senderId", "from", "from_id"]),
      to: pick(m, ["receiver_id", "receiverId", "to", "to_id", "recipient_id"]),
      text: pick(m, ["text", "content", "body", "message"], ""),
      file: typeof file === "string" ? absUrl(file) : (m.attachment_id ? absUrl("/files/" + m.attachment_id + "?token=" + encodeURIComponent(S.token || "")) : ""),
      fileName: pick(m, ["file_name", "fileName", "filename"], ""),
      fileType: pick(m, ["file_type", "fileType", "mime", "mime_type"], ""),
      status: pick(m, ["status"], "sent"),
      at: pick(m, ["created_at", "createdAt", "timestamp", "time", "at"], Date.now()),
      edited: !!pick(m, ["edited", "is_edited", "edited_at"], false),
      deleted: !!pick(m, ["deleted", "is_deleted", "deleted_at"], false),
      reactions: pick(m, ["reactions", "reaction"], null)
    };
  }
  const asList = (r, ...keys) => Array.isArray(r) ? r : (keys.map((k) => r && r[k]).find(Array.isArray) || []);

  /* ========== REST ========== */
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (S.token) headers["Authorization"] = "Bearer " + S.token;
    let body = opts.body;
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(serverUrl() + path, { method: opts.method || "GET", headers, body });
    } catch (e) { throw new Error("تعذّر الاتصال بالخادم"); }
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && S.token && !opts.noAuthRedirect) { logout(true); throw new Error("انتهت الجلسة"); }
    if (!res.ok) throw new Error((data && (data.error || data.message)) || "خطأ (" + res.status + ")");
    return data;
  }

  /* ========== Socket.IO ========== */
  function connectSocket() {
    if (S.socket) { S.socket.disconnect(); S.socket = null; }
    if (typeof io === "undefined") { toast("تعذّر تحميل Socket.IO"); return; }
    const s = io(serverUrl(), { auth: { token: S.token }, transports: ["websocket", "polling"] });
    S.socket = s;
    s.on("connect", () => setConn(true));
    s.on("disconnect", () => setConn(false));
    s.on("connect_error", (e) => { setConn(false); if (/auth|token|unauthorized/i.test(e.message || "")) logout(true); });

    s.on("message:new", (raw) => {
      const m = normMsg(raw.message || raw);
      const peer = m.from === S.me.id ? m.to : m.from;
      addMsg(peer, m);
      if (m.from !== S.me.id) {
        s.emit("message:delivered", { id: m.id, messageId: m.id, from: m.from });
        if (S.active && S.active.id === peer && !document.hidden) markRead(peer);
        else { S.unread[peer] = (S.unread[peer] || 0) + 1; notifyMsg(m, peer); }
      }
      ensureContact(peer);
      renderList(); if (S.active && S.active.id === peer) renderMsgs();
    });
    s.on("message:status", (d) => updateMsg(d, (m) => { m.status = d.status || m.status; }));
    s.on("message:delivered", (d) => updateMsg(d, (m) => { if (m.status !== "read") m.status = "delivered"; }));
    s.on("message:read", (d) => {
      const peer = pick(d, ["by", "userId", "user_id", "from", "reader_id"]);
      (S.msgs[peer] || []).forEach((m) => { if (m.from === S.me.id) m.status = "read"; });
      updateMsg(d, (m) => { m.status = "read"; });
    });
    s.on("message:edited", (d) => updateMsg(d, (m) => { const n = normMsg(d.message || d); m.text = n.text; m.edited = true; }));
    s.on("message:deleted", (d) => updateMsg(d, (m) => { m.deleted = true; m.text = ""; m.file = ""; }));
    s.on("message:reaction", (d) => updateMsg(d, (m) => { m.reactions = d.reactions || d.reaction || d.emoji || m.reactions; }));
    s.on("typing:start", (d) => setTyping(pick(d, ["from", "userId", "user_id"]), true));
    s.on("typing:stop", (d) => setTyping(pick(d, ["from", "userId", "user_id"]), false));
    s.on("presence", (d) => {
      const id = pick(d, ["userId", "user_id", "id"]);
      const on = pick(d, ["online", "isOnline"], pick(d, ["status"], "") === "online");
      if (on) S.online.add(id); else S.online.delete(id);
      renderList(); renderHead();
    });
  }
  function updateMsg(d, fn) {
    const id = pick(d, ["id", "messageId", "message_id"], d && d.message && d.message.id);
    const tmp = pick(d, ["tempId", "temp_id"], null);
    for (const peer in S.msgs) {
      const m = S.msgs[peer].find((x) => (id != null && x.id === id) || (tmp && x.tempId === tmp));
      if (m) { if (id != null) m.id = id; fn(m); if (S.active && String(S.active.id) === String(peer)) renderMsgs(); return; }
    }
  }
  function setConn(ok) { const e = document.getElementById("conn"); if (e) e.textContent = ok ? "" : "جارٍ الاتصال…"; }

  /* ========== بيانات ========== */
  function addMsg(peer, m) {
    const list = S.msgs[peer] = S.msgs[peer] || [];
    const i = list.findIndex((x) => (m.id != null && x.id === m.id) || (m.tempId && x.tempId === m.tempId));
    if (i >= 0) list[i] = Object.assign(list[i], m); else list.push(m);
  }
  function ensureContact(id) {
    if (S.contacts.some((c) => c.id === id)) return;
    api("/api/users/" + id).then((u) => { const n = normUser(u.user || u); if (n && !S.contacts.some((c) => c.id === n.id)) { S.contacts.push(n); renderList(); } }).catch(() => {});
  }
  async function loadContacts() {
    try {
      const r = await api("/api/contacts");
      S.contacts = asList(r, "contacts", "users", "data").map(normUser).filter(Boolean);
      S.contacts.forEach((c) => { if (c.online) S.online.add(c.id); if (c.unread) S.unread[c.id] = c.unread; });
    } catch (e) { toast(e.message); }
    renderList();
  }
  async function openChat(user) {
    S.active = user; S.unread[user.id] = 0;
    document.querySelector(".shell").classList.add("chat-open");
    renderHead(); renderList();
    renderMsgs();
    try {
      const r = await api("/api/messages/" + user.id);
      S.msgs[user.id] = asList(r, "messages", "data").map(normMsg).filter(Boolean);
    } catch (e) { toast(e.message); }
    if (S.active && S.active.id === user.id) { renderMsgs(); markRead(user.id); }
  }
  function markRead(peer) {
    S.unread[peer] = 0;
    if (S.socket) S.socket.emit("message:read", { from: peer, userId: peer, to: peer });
    renderList();
  }
  function sendText(text, extra) {
    if (!S.active || !S.socket) return;
    const tempId = "t" + Date.now() + Math.random().toString(16).slice(2, 6);
    const payload = Object.assign({ to: S.active.id, text }, extra && { kind: extra.kind, attachmentId: extra.attachmentId, sticker: extra.sticker });
    const m = normMsg(Object.assign({ sender_id: S.me.id, receiver_id: S.active.id, text, status: "sending", created_at: Date.now(), tempId }, extra || {}));
    addMsg(S.active.id, m);
    S.socket.emit("message:send", payload, (ack) => {
      if (ack && (ack.error || ack.ok === false)) { toast(ack.error || "فشل الإرسال"); m.status = "failed"; }
      else if (ack) { const n = normMsg(ack.message || ack); if (n && n.id != null) { m.id = n.id; m.status = n.status === "sending" ? "sent" : n.status; } }
      if (m.status === "sending") m.status = "sent";
      renderMsgs();
    });
    renderMsgs(); renderList();
  }
  async function sendFile(file) {
    if (!file || !S.active) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      toast("جارٍ الرفع…");
      const r = await api("/api/upload", { method: "POST", body: fd });
      const uploaded = r.file || r;
      const attachmentId = uploaded.id || uploaded.attachment_id;
      if (!attachmentId) throw new Error("لم يرجع الخادم معرف الملف");
      sendText(file.name, { kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file", attachmentId });
    } catch (e) { toast(e.message); }
  }
  function setTyping(id, on) {
    clearTimeout(S.typing[id]);
    if (on) { S.typing[id] = setTimeout(() => setTyping(id, false), 4000); }
    else delete S.typing[id];
    if (S.active && S.active.id === id) { const t = document.getElementById("typing"); if (t) t.textContent = on ? "يكتب الآن…" : ""; }
  }

  /* ========== أدوات الواجهة ========== */
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  function avatar(u, cls) {
    const a = el("div", { class: "avatar " + (cls || "") });
    if (u && u.avatar) a.append(el("img", { src: u.avatar, alt: "" }));
    else a.append(((u && u.name) || "?").trim().charAt(0).toUpperCase());
    if (u && S.online.has(u.id)) a.append(el("span", { class: "dot" }));
    return a;
  }
  function fmtTime(t) {
    const d = new Date(typeof t === "string" && /^\d+$/.test(t) ? +t : t);
    if (isNaN(d)) return "";
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("ar", { day: "numeric", month: "short" });
  }
  function toast(t) {
    const n = el("div", { class: "toast" }, t); document.body.append(n); setTimeout(() => n.remove(), 2600);
  }
  function applyTheme() { document.documentElement.setAttribute("data-theme", S.theme); }
  function statusMark(m) {
    return { sending: "🕓", sent: "✓", delivered: "✓✓", read: "✓✓", failed: "⚠" }[m.status] || "✓";
  }
  function notifyMsg(m, peer) {
    if (!S.notify || !("Notification" in window) || Notification.permission !== "granted") return;
    const u = S.contacts.find((c) => c.id === peer);
    try { new Notification(u ? u.name : "رسالة جديدة", { body: m.text || "مرفق", icon: "icon.svg" }); } catch (e) {}
  }

  /* ========== شاشة الدخول ========== */
  function renderAuth() {
    document.title = "Bird — دخول";
    let mode = "login";
    const root = document.getElementById("app"); root.innerHTML = "";
    const err = el("div", { class: "err" });
    const user = el("input", { autocomplete: "username", autocapitalize: "none", placeholder: "اسم المستخدم" });
    const name = el("input", { placeholder: "الاسم الظاهر" });
    const pass = el("input", { type: "password", autocomplete: "current-password", placeholder: "كلمة المرور" });
    const nameF = el("label", { class: "field hidden" }, el("span", null, "الاسم الظاهر"), name);
    const submit = el("button", { class: "btn", type: "submit" }, "تسجيل الدخول");
    const toggle = el("button", { class: "link", type: "button" }, "ليس لديك حساب؟ أنشئ حساباً");
    const sub = el("p", { class: "sub" }, "مرحباً بعودتك");
    toggle.onclick = () => {
      mode = mode === "login" ? "register" : "login";
      const reg = mode === "register";
      nameF.classList.toggle("hidden", !reg);
      submit.textContent = reg ? "إنشاء الحساب" : "تسجيل الدخول";
      toggle.textContent = reg ? "لديك حساب؟ سجّل الدخول" : "ليس لديك حساب؟ أنشئ حساباً";
      sub.textContent = reg ? "أنشئ حسابك في ثوانٍ" : "مرحباً بعودتك";
      err.textContent = "";
    };
    const form = el("form", { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      const u = user.value.trim(), p = pass.value;
      if (!u || !p) { err.textContent = "أدخل اسم المستخدم وكلمة المرور"; return; }
      if (p.length < 8 && mode === "register") { err.textContent = "كلمة المرور 8 أحرف على الأقل"; return; }
      submit.disabled = true;
      try {
        const body = mode === "register" ? { username: u, password: p } : { username: u, password: p };
        const r = await api(mode === "register" ? "/api/register" : "/api/login", { method: "POST", body, noAuthRedirect: true });
        const token = pick(r, ["token", "accessToken", "jwt"]);
        if (!token) throw new Error("لم يرجع الخادم توكن");
        S.token = token; LS.set("bird.token", token);
        let me = r.user || r.me;
        if (!me) me = (await api("/api/me")).user || null;
        S.me = normUser(me || {}); LS.set("bird.me", S.me);
        start();
      } catch (ex) { err.textContent = ex.message; }
      submit.disabled = false;
    } },
      el("label", { class: "field" }, el("span", null, "اسم المستخدم"), user),
      nameF,
      el("label", { class: "field" }, el("span", null, "كلمة المرور"), pass),
      err, submit, toggle,
      el("button", { class: "link", type: "button", onclick: serverDialog }, "⚙ إعدادات الخادم")
    );
    root.append(el("div", { class: "auth" }, el("div", { class: "auth-card" },
      el("img", { class: "auth-logo", src: "icon.svg", alt: "Bird" }),
      el("h1", null, "Bird"), sub, form)));
  }
  function serverDialog() {
    const v = prompt("عنوان الخادم:", serverUrl());
    if (v && /^https?:\/\//.test(v)) { LS.set("bird.server", v.trim()); toast("تم حفظ عنوان الخادم"); }
  }

  /* ========== الواجهة الرئيسية ========== */
  let searchTimer = null, searchResults = null;
  function renderShell() {
    document.title = "Bird";
    const root = document.getElementById("app"); root.innerHTML = "";
    const search = el("input", { id: "q", placeholder: "بحث عن مستخدم…", oninput: (e) => {
      clearTimeout(searchTimer);
      const q = e.target.value.trim();
      if (q.length < 2) { searchResults = null; renderList(); return; }
      searchTimer = setTimeout(async () => {
        try { const r = await api("/api/users/search?q=" + encodeURIComponent(q)); searchResults = asList(r, "users", "results", "data").map(normUser).filter((u) => u && u.id !== S.me.id); }
        catch (ex) { searchResults = []; }
        renderList();
      }, 300);
    } });
    const side = el("div", { class: "side" },
      el("div", { class: "topbar" },
        el("button", { class: "icon-btn", title: "الحساب", onclick: openAccount }, avatar(S.me, "sm")),
        el("h2", null, "Bird ", el("small", { id: "conn", style: "font-weight:400;color:var(--muted);font-size:12px" })),
        el("button", { class: "icon-btn", title: "الإعدادات", onclick: openSettings }, "⚙")),
      el("div", { class: "search" }, search),
      el("div", { class: "list", id: "list" }));
    const main = el("div", { class: "main", id: "main" });
    root.append(el("div", { class: "shell" }, side, main));
    renderMain(); renderList();
  }
  function renderList() {
    const list = document.getElementById("list"); if (!list) return;
    list.innerHTML = "";
    const mk = (u, isResult) => {
      const msgs = S.msgs[u.id] || [];
      const last = msgs[msgs.length - 1];
      const lastText = last ? (last.deleted ? "🚫 رسالة محذوفة" : last.text || (last.file ? "📎 مرفق" : "")) : (typeof u.last === "string" ? u.last : "@" + u.username);
      return el("button", { class: "row" + (S.active && S.active.id === u.id ? " active" : ""), onclick: async () => {
        if (isResult && !S.contacts.some((c) => c.id === u.id)) {
          try { await api("/api/contacts", { method: "POST", body: { contactId: u.id } }); S.contacts.push(u); } catch (e) { /* قد تكون موجودة */ S.contacts.push(u); }
          document.getElementById("q").value = ""; searchResults = null;
        }
        openChat(u);
      } },
        avatar(u),
        el("div", { class: "info" }, el("div", { class: "name" }, u.name), el("div", { class: "last" }, lastText)),
        el("div", { class: "meta" }, last ? fmtTime(last.at) : "", S.unread[u.id] ? el("div", { class: "badge" }, S.unread[u.id]) : null));
    };
    if (searchResults) {
      list.append(el("div", { class: "section-title" }, "نتائج البحث"));
      if (!searchResults.length) list.append(el("div", { class: "empty" }, "لا توجد نتائج"));
      searchResults.forEach((u) => list.append(mk(u, true)));
      return;
    }
    if (!S.contacts.length) { list.append(el("div", { class: "empty" }, "لا توجد محادثات بعد.\nابحث عن مستخدم لبدء المحادثة.")); return; }
    const sorted = S.contacts.slice().sort((a, b) => {
      const la = (S.msgs[a.id] || []).slice(-1)[0], lb = (S.msgs[b.id] || []).slice(-1)[0];
      return (lb ? new Date(lb.at).getTime() : 0) - (la ? new Date(la.at).getTime() : 0);
    });
    sorted.forEach((u) => list.append(mk(u, false)));
  }
  function renderMain() {
    const main = document.getElementById("main"); main.innerHTML = "";
    if (!S.active) { main.append(el("div", { class: "empty" }, "اختر محادثة للبدء")); return; }
    const ta = el("textarea", { rows: 1, placeholder: "اكتب رسالة…", oninput: (e) => {
      e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
      if (S.socket && S.active) {
        S.socket.emit("typing:start", { to: S.active.id, receiver_id: S.active.id });
        clearTimeout(ta._t); ta._t = setTimeout(() => S.socket && S.active && S.socket.emit("typing:stop", { to: S.active.id, receiver_id: S.active.id }), 1500);
      }
    }, onkeydown: (e) => { if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 760) { e.preventDefault(); go(); } } });
    const fileIn = el("input", { type: "file", class: "hidden", onchange: (e) => { sendFile(e.target.files[0]); e.target.value = ""; } });
    const go = () => { const t = ta.value.trim(); if (!t) return; ta.value = ""; ta.style.height = "auto"; sendText(t); };
    main.append(
      el("div", { class: "topbar", id: "head" }),
      el("div", { class: "msgs", id: "msgs" }),
      el("div", { class: "typing", id: "typing" }),
      el("div", { class: "composer" },
        el("button", { class: "icon-btn", title: "إرفاق", onclick: () => fileIn.click() }, "📎"), fileIn, ta,
        el("button", { class: "icon-btn send", title: "إرسال", onclick: go }, "➤")));
    renderHead();
  }
  function renderHead() {
    const h = document.getElementById("head"); if (!h || !S.active) return;
    h.innerHTML = "";
    const u = S.active;
    h.append(
      el("button", { class: "icon-btn back", onclick: () => { document.querySelector(".shell").classList.remove("chat-open"); S.active = null; renderMain(); renderList(); } }, "→"),
      avatar(u, "sm"),
      el("h2", null, u.name, el("div", { style: "font-size:12px;font-weight:400;color:var(--muted)" }, S.online.has(u.id) ? "متصل الآن" : "غير متصل")),
      el("button", { class: "icon-btn", title: "حظر", onclick: async () => {
        if (!confirm("حظر " + u.name + "؟")) return;
        try { await api("/api/blocks", { method: "POST", body: { user_id: u.id, userId: u.id, blocked_id: u.id } }); toast("تم الحظر"); } catch (e) { toast(e.message); }
      } }, "🚫"));
  }
  function renderMsgs() {
    if (!S.active) return;
    let box = document.getElementById("msgs");
    if (!box) { renderMain(); box = document.getElementById("msgs"); }
    const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    box.innerHTML = "";
    const list = S.msgs[S.active.id] || [];
    if (!list.length) box.append(el("div", { class: "empty" }, "لا توجد رسائل. قل مرحباً 👋"));
    list.forEach((m) => {
      const mine = m.from === S.me.id;
      const b = el("div", { class: "bubble " + (mine ? "out" : "in") + (m.deleted ? " deleted" : ""), oncontextmenu: (e) => { e.preventDefault(); msgMenu(e, m, mine); } });
      if (m.deleted) b.append("🚫 تم حذف هذه الرسالة");
      else {
        if (m.file) {
          const isImg = /^image\//.test(m.fileType) || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(m.file);
          if (isImg) b.append(el("a", { href: m.file, target: "_blank", rel: "noopener" }, el("img", { class: "att", src: m.file, alt: "" })));
          else b.append(el("a", { class: "file", href: m.file, target: "_blank", rel: "noopener" }, "📎 " + (m.fileName || m.text || "ملف")));
        }
        if (m.text && !(m.file && m.text === m.fileName)) b.append(el("div", null, m.text));
        if (m.reactions) b.append(el("div", { class: "react" }, typeof m.reactions === "string" ? m.reactions : Array.isArray(m.reactions) ? m.reactions.map((r) => r.emoji || r).join(" ") : Object.keys(m.reactions).join(" ")));
      }
      b.append(el("div", { class: "t" }, m.edited ? "معدّلة" : "", fmtTime(m.at), mine ? el("span", { style: m.status === "read" ? "color:var(--brand)" : "" }, statusMark(m)) : null));
      let pressT; b.addEventListener("touchstart", (e) => { pressT = setTimeout(() => msgMenu(e.touches[0], m, mine), 500); }); b.addEventListener("touchend", () => clearTimeout(pressT)); b.addEventListener("touchmove", () => clearTimeout(pressT));
      box.append(b);
    });
    if (stick || list.length) box.scrollTop = box.scrollHeight;
  }
  function msgMenu(pt, m, mine) {
    document.querySelectorAll(".menu").forEach((x) => x.remove());
    if (m.deleted || m.id == null) return;
    const close = () => menu.remove();
    const items = [];
    ["👍", "❤️", "😂", "😮"].forEach((e) => items.push(el("button", { onclick: () => { close(); api("/api/messages/" + m.id + "/react", { method: "POST", body: { reaction: e } }).then(() => { m.reactions = e; renderMsgs(); }).catch((x) => toast(x.message)); } }, e + " تفاعل")));
    if (m.text) items.push(el("button", { onclick: () => { close(); navigator.clipboard && navigator.clipboard.writeText(m.text); toast("تم النسخ"); } }, "نسخ"));
    if (mine && m.text) items.push(el("button", { onclick: () => { close(); const t = prompt("تعديل الرسالة:", m.text); if (t && t.trim() && t !== m.text) api("/api/messages/" + m.id + "/edit", { method: "POST", body: { text: t.trim() } }).then(() => { m.text = t.trim(); m.edited = true; renderMsgs(); }).catch((x) => toast(x.message)); } }, "تعديل"));
    if (mine) items.push(el("button", { class: "d", onclick: () => { close(); if (confirm("حذف الرسالة؟")) api("/api/messages/" + m.id + "/delete", { method: "POST", body: { mode: "everyone" } }).then(() => { m.deleted = true; renderMsgs(); }).catch((x) => toast(x.message)); } }, "حذف"));
    const menu = el("div", { class: "menu" }, items);
    document.body.append(menu);
    const x = Math.min(pt.clientX, window.innerWidth - 170), y = Math.min(pt.clientY, window.innerHeight - items.length * 40 - 10);
    menu.style.left = Math.max(8, x) + "px"; menu.style.top = Math.max(8, y) + "px";
    setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
  }

  /* ========== الحساب ========== */
  function page(title, build) {
    const p = el("div", { class: "page" },
      el("div", { class: "topbar" }, el("button", { class: "icon-btn", onclick: () => p.remove() }, "→"), el("h2", null, title)),
      el("div", { class: "body" }));
    build(p.querySelector(".body"), p);
    document.body.append(p); return p;
  }
  function openAccount() {
    page("الحساب", (body) => {
      const name = el("input", { value: S.me.name }), bio = el("input", { value: S.me.bio || "", placeholder: "نبذة عنك" });
      const msg = el("div", { class: "err" });
      const av = el("div", { class: "profile-head" });
      const drawAv = () => { av.innerHTML = ""; av.append(avatar(S.me, "lg"), el("div", null, "@" + S.me.username)); };
      drawAv();
      const file = el("input", { type: "file", accept: "image/*", class: "hidden", onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const fd = new FormData(); fd.append("avatar", f); fd.append("file", f);
        try { const r = await api("/api/me/avatar", { method: "POST", body: fd }); const u = normUser(r.user || r); S.me.avatar = (u && u.avatar) || absUrl(pick(r, ["url", "avatar_url", "avatar"], "")) || S.me.avatar; LS.set("bird.me", S.me); drawAv(); renderShell(); toast("تم تحديث الصورة"); } catch (ex) { toast(ex.message); }
      } });
      const sessions = el("div");
      const loadSessions = async () => {
        try {
          const r = await api("/api/sessions"); const arr = asList(r, "sessions", "data");
          sessions.innerHTML = "";
          if (!arr.length) sessions.append(el("div", { class: "empty" }, "لا توجد جلسات"));
          arr.forEach((s) => sessions.append(el("div", { class: "setrow" },
            el("div", null, pick(s, ["device", "user_agent", "userAgent", "name"], "جهاز"), el("div", { style: "font-size:12px;color:var(--muted)" }, fmtTime(pick(s, ["created_at", "last_active", "createdAt"], "")))),
            s.current ? el("span", { style: "color:var(--ok)" }, "الحالية") : el("button", { class: "link", style: "width:auto;margin:0;color:var(--danger)", onclick: async () => { try { await api("/api/sessions/" + s.id, { method: "DELETE" }); loadSessions(); } catch (ex) { toast(ex.message); } } }, "إنهاء"))));
        } catch (ex) { sessions.innerHTML = ""; sessions.append(el("div", { class: "empty" }, "تعذّر تحميل الجلسات")); }
      };
      const blocks = el("div");
      const loadBlocks = async () => {
        try {
          const r = await api("/api/blocks"); const arr = asList(r, "blocks", "users", "data");
          blocks.innerHTML = "";
          if (!arr.length) blocks.append(el("div", { class: "empty" }, "لا يوجد مستخدمون محظورون"));
          arr.forEach((b) => { const u = normUser(b.user || b); const id = pick(b, ["blocked_id", "user_id", "id"], u.id); blocks.append(el("div", { class: "setrow" }, el("div", null, u.name), el("button", { class: "link", style: "width:auto;margin:0", onclick: async () => { try { await api("/api/blocks/" + id, { method: "DELETE" }); loadBlocks(); } catch (ex) { toast(ex.message); } } }, "إلغاء الحظر"))); });
        } catch (ex) { blocks.innerHTML = ""; blocks.append(el("div", { class: "empty" }, "تعذّر تحميل القائمة")); }
      };
      body.append(
        el("div", { class: "card" }, av, el("button", { class: "btn ghost", onclick: () => file.click() }, "تغيير الصورة"), file),
        el("div", { class: "card" }, el("h3", null, "المعلومات"),
          el("label", { class: "field" }, el("span", null, "الاسم الظاهر"), name),
          el("label", { class: "field" }, el("span", null, "النبذة"), bio), msg,
          el("button", { class: "btn", onclick: async () => {
            msg.textContent = "";
            try {
              const r = await api("/api/profile", { method: "PATCH", body: { display_name: name.value.trim(), bio: bio.value.trim() } });
              const u = normUser(r.user || r); Object.assign(S.me, { name: name.value.trim(), bio: bio.value.trim() }, u && u.id ? { name: u.name, bio: u.bio } : {});
              LS.set("bird.me", S.me); toast("تم الحفظ"); renderShell();
            } catch (ex) { msg.textContent = ex.message; }
          } }, "حفظ")),
        el("div", { class: "card" }, el("h3", null, "الجلسات النشطة"), sessions),
        el("div", { class: "card" }, el("h3", null, "المحظورون"), blocks),
        el("button", { class: "btn danger", onclick: () => logout(false) }, "تسجيل الخروج"));
      loadSessions(); loadBlocks();
    });
  }

  /* ========== الإعدادات ========== */
  function openSettings() {
    page("الإعدادات", (body) => {
      const theme = el("button", { class: "btn ghost", style: "width:auto;padding:8px 16px", onclick: (e) => { S.theme = S.theme === "dark" ? "light" : "dark"; LS.set("bird.theme", S.theme); applyTheme(); e.target.textContent = S.theme === "dark" ? "داكن" : "فاتح"; } }, S.theme === "dark" ? "داكن" : "فاتح");
      const notif = el("button", { class: "btn ghost", style: "width:auto;padding:8px 16px", onclick: async (e) => {
        if (!("Notification" in window)) { toast("المتصفح لا يدعم الإشعارات"); return; }
        if (!S.notify) { const p = await Notification.requestPermission(); S.notify = p === "granted"; } else S.notify = false;
        LS.set("bird.notify", S.notify); e.target.textContent = S.notify ? "مفعّلة" : "متوقفة";
      } }, S.notify ? "مفعّلة" : "متوقفة");
      const srv = el("input", { value: serverUrl(), dir: "ltr" });
      let prefsNote = el("div", { class: "err", style: "color:var(--muted)" });
      body.append(
        el("div", { class: "card" }, el("h3", null, "المظهر والإشعارات"),
          el("div", { class: "setrow" }, el("span", null, "المظهر"), theme),
          el("div", { class: "setrow" }, el("span", null, "إشعارات الرسائل"), notif)),
        el("div", { class: "card" }, el("h3", null, "الخادم"),
          el("label", { class: "field" }, el("span", null, "عنوان الخادم"), srv), prefsNote,
          el("button", { class: "btn", onclick: () => {
            const v = srv.value.trim();
            if (!/^https?:\/\//.test(v)) { toast("عنوان غير صالح"); return; }
            LS.set("bird.server", v); toast("تم الحفظ، سيعاد الاتصال"); connectSocket(); loadContacts();
          } }, "حفظ وإعادة الاتصال"),
          el("button", { class: "link", onclick: async () => {
            try { const r = await fetch(serverUrl() + "/health"); prefsNote.textContent = r.ok ? "الخادم يعمل ✓" : "الخادم رد بخطأ " + r.status; } catch (e) { prefsNote.textContent = "تعذّر الوصول إلى الخادم"; }
          } }, "فحص الاتصال")),
        el("div", { class: "card" }, el("h3", null, "عن التطبيق"), el("div", { class: "setrow" }, el("span", null, "Bird"), el("span", { style: "color:var(--muted)" }, "الإصدار 1.0"))));
    });
  }

  /* ========== الدورة ========== */
  function logout(expired) {
    if (S.socket) S.socket.disconnect();
    S.socket = null; S.token = null; S.me = null; S.contacts = []; S.msgs = {}; S.active = null;
    LS.del("bird.token"); LS.del("bird.me");
    document.querySelectorAll(".page,.menu").forEach((x) => x.remove());
    renderAuth(); if (expired) toast("انتهت الجلسة، سجّل الدخول من جديد");
  }
  async function start() {
    applyTheme(); renderShell(); connectSocket();
    try { const r = await api("/api/me"); const u = normUser(r.user || r); if (u && u.id != null) { S.me = u; LS.set("bird.me", u); } } catch (e) {}
    loadContacts();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.active) markRead(S.active.id); });
  applyTheme();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  if (S.token && S.me) start(); else renderAuth();
})();
