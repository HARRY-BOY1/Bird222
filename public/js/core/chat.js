import { api } from "./api.js";
import { state, bus, addMsg } from "./state.js";
import { asList, normMsg, pick, same } from "./adapter.js";
import { emitEvent, markRead } from "./socket.js";

export async function openChat(user) {
  state.active = user;
  state.unread[user.id] = 0;
  bus.emit("chat-open");
  bus.emit("list");
  try {
    const res = await api.get(`/api/messages/${user.id}`);
    state.msgs[user.id] = asList(res, "messages", "data").map(normMsg).filter(Boolean);
  } catch (e) { bus.emit("notice", e.message); }
  if (state.active && same(state.active.id, user.id)) {
    bus.emit("messages");
    markRead(user.id);
  }
}

export function closeChat() {
  state.active = null;
  bus.emit("chat-open");
  bus.emit("list");
}

export function sendText(text, extra = {}) {
  const peer = state.active;
  if (!peer) return;
  const tempId = "t" + Date.now() + Math.random().toString(16).slice(2, 6);
  const payload = { to: peer.id, text, ...extra };
  const msg = normMsg({ sender_id: state.me.id, receiver_id: peer.id, text, status: "sending", created_at: Date.now(), tempId, ...extra });
  addMsg(peer.id, msg);

  emitEvent("message:send", payload, (ack) => {
    if (ack && (ack.error || ack.ok === false)) {
      msg.status = "failed";
      bus.emit("notice", ack.error || "فشل الإرسال");
    } else if (ack) {
      const saved = normMsg(ack.message || ack);
      if (saved && saved.id != null) { msg.id = saved.id; msg.status = saved.status === "sending" ? "sent" : saved.status; }
    }
    if (msg.status === "sending") msg.status = "sent";
    bus.emit("messages");
  });
  bus.emit("messages");
  bus.emit("list");
}

export async function sendFile(file) {
  if (!file || !state.active) return;
  const form = new FormData();
  form.append("file", file);
  try {
    bus.emit("notice", "جارٍ الرفع…");
    const res = await api.upload("/api/upload", form);
    const uploaded = res && (res.file || res);
    const attachmentId = uploaded && (uploaded.id || uploaded.attachment_id);
    if (!attachmentId) throw new Error("لم يرجع الخادم معرف الملف");
    sendText(file.name, {
      kind: file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file",
      attachmentId
    });
  } catch (e) { bus.emit("notice", e.message); }
}

export function emitTyping(on) {
  if (!state.active) return;
  emitEvent(on ? "typing:start" : "typing:stop", { to: state.active.id, receiver_id: state.active.id });
}

export async function editMessage(m, text) {
  await api.post(`/api/messages/${m.id}/edit`, { text });
  m.text = text; m.edited = true;
  bus.emit("messages");
}

export async function deleteMessage(m) {
  await api.post(`/api/messages/${m.id}/delete`, { mode: "everyone" });
  m.deleted = true;
  bus.emit("messages");
}

export async function reactToMessage(m, emoji) {
  await api.post(`/api/messages/${m.id}/react`, { reaction: emoji });
  m.reactions = emoji;
  bus.emit("messages");
}

export async function blockUser(user) {
  await api.post("/api/blocks", { userId: user.id });
}
