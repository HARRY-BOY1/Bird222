import { CONFIG } from "./config.js";
import { state, bus, addMsg, findMsg, setOnline } from "./state.js";
import { normMsg, pick, same } from "./adapter.js";
import { ensureContact } from "./contacts.js";
import { notifyMessage } from "./notify.js";

let socket = null;
const typingTimers = {};

function loadScript(src) {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => { s.remove(); resolve(false); };
    document.head.append(s);
  });
}

// عميل Socket.IO يُقدَّم من الخادم نفسه (عبر الوسيط)، والـ CDN احتياطي
async function ensureClient() {
  if (window.io) return true;
  return (await loadScript(CONFIG.API_BASE + "/socket.io/socket.io.js")) || (await loadScript(CONFIG.SOCKET_FALLBACK_CDN));
}

export async function connectSocket() {
  disconnectSocket();
  if (!(await ensureClient())) { bus.emit("notice", "تعذّر تحميل مكتبة الاتصال الفوري"); return; }

  const options = { auth: { token: state.token }, transports: ["websocket", "polling"] };
  const s = (socket = CONFIG.API_BASE ? window.io(CONFIG.API_BASE, options) : window.io(options));

  s.on("connect", () => setConnected(true));
  s.on("disconnect", () => setConnected(false));
  s.on("connect_error", (e) => {
    setConnected(false);
    if (/auth|token|unauthorized/i.test((e && e.message) || "")) bus.emit("session-expired");
  });

  s.on("message:new", onNewMessage);
  s.on("message:status", (d) => patch(d, (m) => { m.status = d.status || m.status; }));
  s.on("message:delivered", (d) => patch(d, (m) => { if (m.status !== "read") m.status = "delivered"; }));
  s.on("message:read", onRead);
  s.on("message:edited", (d) => patch(d, (m) => { m.text = normMsg(d.message || d).text; m.edited = true; }));
  s.on("message:deleted", (d) => patch(d, (m) => { m.deleted = true; m.text = ""; m.file = ""; }));
  s.on("message:reaction", (d) => patch(d, (m) => { m.reactions = d.reactions || d.reaction || d.emoji || m.reactions; }));
  s.on("typing:start", (d) => setTyping(pick(d, ["from", "userId", "user_id"]), true));
  s.on("typing:stop", (d) => setTyping(pick(d, ["from", "userId", "user_id"]), false));
  s.on("presence", onPresence);
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null; }
  setConnected(false);
}

export function emitEvent(event, payload, ack) {
  if (socket) socket.emit(event, payload, ack);
}
export const isConnected = () => !!(socket && socket.connected);

export function markRead(peer) {
  state.unread[peer] = 0;
  emitEvent("message:read", { from: peer, userId: peer, to: peer });
  bus.emit("list");
}

/* ---------- معالجات الأحداث ---------- */
function setConnected(on) {
  state.connected = on;
  bus.emit("conn");
}

function onNewMessage(raw) {
  const m = normMsg(raw.message || raw);
  if (!m) return;
  const mine = same(m.from, state.me.id);
  const peer = mine ? m.to : m.from;
  addMsg(peer, m);

  if (!mine) {
    emitEvent("message:delivered", { id: m.id, messageId: m.id, from: m.from });
    const viewing = state.active && same(state.active.id, peer) && !document.hidden;
    if (viewing) markRead(peer);
    else { state.unread[peer] = (state.unread[peer] || 0) + 1; notifyMessage(m, peer); }
  }
  ensureContact(peer);
  bus.emit("list");
  if (state.active && same(state.active.id, peer)) bus.emit("messages");
}

function onRead(d) {
  const peer = pick(d, ["by", "userId", "user_id", "from", "reader_id"]);
  (state.msgs[peer] || []).forEach((m) => { if (same(m.from, state.me.id)) m.status = "read"; });
  patch(d, (m) => { m.status = "read"; });
  bus.emit("messages");
}

function onPresence(d) {
  const id = pick(d, ["userId", "user_id", "id"]);
  const on = pick(d, ["online", "isOnline"], pick(d, ["status"], "") === "online");
  setOnline(id, !!on);
  bus.emit("list");
  bus.emit("head");
}

function setTyping(id, on) {
  clearTimeout(typingTimers[id]);
  if (on) {
    state.typing[id] = true;
    typingTimers[id] = setTimeout(() => setTyping(id, false), 4000);
  } else delete state.typing[id];
  bus.emit("typing", id);
}

function patch(d, fn) {
  const found = findMsg(d);
  if (!found) return;
  fn(found.msg);
  bus.emit("list");
  if (state.active && same(state.active.id, found.peer)) bus.emit("messages");
}
