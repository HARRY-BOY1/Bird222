import { api } from "./api.js";
import { state, bus, setOnline } from "./state.js";
import { asList, normUser, same } from "./adapter.js";

export async function loadContacts() {
  try {
    const res = await api.get("/api/contacts");
    state.contacts = asList(res, "contacts", "users", "data").map(normUser).filter(Boolean);
    for (const c of state.contacts) {
      if (c.online) setOnline(c.id, true);
      if (c.unread) state.unread[c.id] = c.unread;
    }
  } catch (e) { bus.emit("notice", e.message); }
  bus.emit("list");
}

export async function searchUsers(q) {
  try {
    const res = await api.get("/api/users/search?q=" + encodeURIComponent(q));
    return asList(res, "users", "results", "data").map(normUser)
      .filter((u) => u && !same(u.id, state.me && state.me.id));
  } catch (e) { return []; }
}

export async function addContact(user) {
  if (state.contacts.some((c) => same(c.id, user.id))) return;
  try {
    await api.post("/api/contacts", { contactId: user.id });
  } catch (e) { /* قد تكون مضافة مسبقاً */ }
  state.contacts.push(user);
  bus.emit("list");
}

// رسالة من شخص غير موجود في القائمة: نجلبه ونضيفه
export async function ensureContact(id) {
  if (state.contacts.some((c) => same(c.id, id))) return;
  try {
    const res = await api.get("/api/users/" + id);
    const user = normUser(res.user || res);
    if (user && user.id != null && !state.contacts.some((c) => same(c.id, user.id))) {
      state.contacts.push(user);
      bus.emit("list");
    }
  } catch (e) { /* تجاهل */ }
}
