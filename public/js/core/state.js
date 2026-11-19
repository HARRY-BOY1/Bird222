import { LS } from "./storage.js";
import { same } from "./adapter.js";

/* ناقل أحداث بسيط يفصل المنطق عن الواجهة */
const listeners = new Map();
export const bus = {
  on(topic, fn) {
    if (!listeners.has(topic)) listeners.set(topic, new Set());
    listeners.get(topic).add(fn);
  },
  emit(topic, data) {
    (listeners.get(topic) || []).forEach((fn) => fn(data));
  }
};

export const state = {
  token: LS.get("token", null),
  me: LS.get("me", null),
  contacts: [],
  active: null,                 // المستخدم المفتوح حالياً
  msgs: {},                     // userId -> رسائل
  unread: {},                   // userId -> عدد
  typing: {},                   // userId -> true
  online: new Set(),            // معرفات كنصوص
  pinned: new Set(LS.get("pinned", [])),
  tab: "chats",                 // chats | contacts | settings | profile
  filter: "all",                // all | unread | online
  query: "",
  remote: null,                 // نتائج بحث الخادم
  theme: LS.get("theme", "dark"),
  notify: LS.get("notify", false),
  connected: false
};

export const isOnline = (id) => state.online.has(String(id));
export const setOnline = (id, on) => { on ? state.online.add(String(id)) : state.online.delete(String(id)); };

export function togglePin(id) {
  const key = String(id);
  state.pinned.has(key) ? state.pinned.delete(key) : state.pinned.add(key);
  LS.set("pinned", [...state.pinned]);
  bus.emit("list");
}

export function addMsg(peer, m) {
  const list = (state.msgs[peer] = state.msgs[peer] || []);
  const i = list.findIndex((x) => (m.id != null && same(x.id, m.id)) || (m.tempId && x.tempId === m.tempId));
  if (i >= 0) Object.assign(list[i], m); else list.push(m);
}

// يبحث عن رسالة من حمولة حدث (بالمعرّف أو بالمعرّف المؤقت)
export function findMsg(d) {
  const id = d && (d.id ?? d.messageId ?? d.message_id ?? (d.message && d.message.id));
  const tmp = d && (d.tempId ?? d.temp_id);
  for (const peer in state.msgs) {
    const msg = state.msgs[peer].find((x) => (id != null && same(x.id, id)) || (tmp && x.tempId === tmp));
    if (msg) { if (id != null) msg.id = id; return { peer, msg }; }
  }
  return null;
}
