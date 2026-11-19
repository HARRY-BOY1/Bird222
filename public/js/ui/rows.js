import { state, isOnline, togglePin } from "../core/state.js";
import { same } from "../core/adapter.js";
import { openChat } from "../core/chat.js";
import { addContact } from "../core/contacts.js";
import { el, icon, avatar, fmtTime, onLongPress, popupMenu } from "./dom.js";

export const lastMessage = (id) => {
  const list = state.msgs[id] || [];
  return list[list.length - 1] || null;
};

function previewText(user, last) {
  if (state.typing[user.id]) return el("span", { class: "accent" }, "يكتب…");
  if (last) return last.deleted ? "🚫 رسالة محذوفة" : (last.text || (last.file ? "📎 مرفق" : ""));
  return typeof user.last === "string" && user.last ? user.last : "@" + user.username;
}

function tick(msg) {
  if (!msg || !same(msg.from, state.me.id) || msg.deleted) return null;
  const name = msg.status === "read" || msg.status === "delivered" ? "checks" : msg.status === "sending" ? "clock" : "check";
  return el("span", { class: "tick" + (msg.status === "read" ? " read" : "") }, icon(name, 16));
}

/* صف محادثة في قائمة المحادثات */
export function chatRow(user) {
  const last = lastMessage(user.id);
  const unread = state.unread[user.id] || 0;
  const pinned = state.pinned.has(String(user.id));

  const row = el("button", { class: "row" + (state.active && same(state.active.id, user.id) ? " active" : ""), onclick: () => openChat(user) },
    avatar(user),
    el("div", { class: "row-info" },
      el("div", { class: "row-name" }, user.name),
      el("div", { class: "row-sub" }, previewText(user, last))),
    el("div", { class: "row-meta" },
      el("div", { class: "row-time" }, tick(last), last ? fmtTime(last.at) : ""),
      unread ? el("span", { class: "badge" }, unread > 99 ? "99+" : unread)
        : pinned ? el("span", { class: "pin" }, icon("pin", 16)) : null));

  onLongPress(row, (pt) => popupMenu(pt, [
    { label: pinned ? "إلغاء التثبيت" : "تثبيت", icon: "pin", onClick: () => togglePin(user.id) }
  ]));
  return row;
}

/* صف مستخدم في جهات الاتصال أو نتائج البحث */
export function userRow(user, { remote = false } = {}) {
  return el("button", {
    class: "row",
    onclick: async () => { if (remote) await addContact(user); openChat(user); }
  },
    avatar(user),
    el("div", { class: "row-info" },
      el("div", { class: "row-name" }, user.name),
      el("div", { class: "row-sub" }, isOnline(user.id) ? "متصل الآن" : "@" + user.username)));
}
