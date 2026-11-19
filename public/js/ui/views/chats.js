import { state } from "../../core/state.js";
import { same } from "../../core/adapter.js";
import { el } from "../dom.js";
import { chatRow, userRow, lastMessage } from "../rows.js";

function sortedContacts() {
  return state.contacts.slice().sort((a, b) => {
    const pa = state.pinned.has(String(a.id)), pb = state.pinned.has(String(b.id));
    if (pa !== pb) return pa ? -1 : 1;
    const la = lastMessage(a.id), lb = lastMessage(b.id);
    return (lb ? lb.at : 0) - (la ? la.at : 0) || a.name.localeCompare(b.name, "ar");
  });
}

export function matchesFilter(user) {
  if (state.filter === "unread") return (state.unread[user.id] || 0) > 0;
  if (state.filter === "online") return state.online.has(String(user.id));
  return true;
}

export function renderChats(box) {
  const q = state.query.trim().toLowerCase();
  const items = sortedContacts()
    .filter(matchesFilter)
    .filter((u) => !q || `${u.name} ${u.username}`.toLowerCase().includes(q));

  box.replaceChildren(...items.map(chatRow));

  if (q && state.remote) {
    const extra = state.remote.filter((r) => !state.contacts.some((c) => same(c.id, r.id)));
    if (extra.length) {
      box.append(el("div", { class: "section-title" }, "نتائج البحث"));
      extra.forEach((u) => box.append(userRow(u, { remote: true })));
    }
  }

  if (!box.children.length) {
    const text = q ? "لا توجد نتائج"
      : state.filter === "unread" ? "لا توجد رسائل غير مقروءة"
      : state.filter === "online" ? "لا أحد متصل الآن"
      : "لا توجد محادثات بعد. اضغط الزر الأزرق لبدء محادثة.";
    box.append(el("div", { class: "empty" }, text));
  }
}
