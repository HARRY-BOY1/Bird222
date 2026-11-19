import { state } from "../../core/state.js";
import { same } from "../../core/adapter.js";
import { el } from "../dom.js";
import { userRow } from "../rows.js";

export function renderContacts(box) {
  const q = state.query.trim().toLowerCase();
  const items = state.contacts
    .filter((u) => !q || `${u.name} ${u.username}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  box.replaceChildren();
  if (items.length) {
    box.append(el("div", { class: "section-title" }, `${items.length} جهة اتصال`));
    items.forEach((u) => box.append(userRow(u)));
  }

  if (q && state.remote) {
    const extra = state.remote.filter((r) => !state.contacts.some((c) => same(c.id, r.id)));
    if (extra.length) {
      box.append(el("div", { class: "section-title" }, "مستخدمون جدد"));
      extra.forEach((u) => box.append(userRow(u, { remote: true })));
    }
  }

  if (!box.children.length) {
    box.append(el("div", { class: "empty" }, q ? "لا توجد نتائج" : "لا توجد جهات اتصال. استخدم البحث للعثور على مستخدمين وإضافتهم."));
  }
}
