import { state, isOnline } from "../core/state.js";
import { same } from "../core/adapter.js";
import { closeChat, sendText, sendFile, emitTyping, editMessage, deleteMessage, reactToMessage, blockUser } from "../core/chat.js";
import { el, icon, avatar, fmtTime, dayLabel, onLongPress, popupMenu, pointOf, toast } from "./dom.js";

let pane = null;

export function mountChatPane(node) {
  pane = node;
  renderChatPane();
}

export function renderChatPane() {
  const user = state.active;
  if (!user) {
    pane.replaceChildren(el("div", { class: "empty big" }, el("span", { class: "empty-pill" }, "اختر محادثة لبدء المراسلة")));
    return;
  }

  const input = el("textarea", { rows: 1, placeholder: "رسالة", "aria-label": "اكتب رسالة" });
  const fileInput = el("input", { type: "file", class: "hidden" });
  let typingTimer;

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    clearTimeout(typingTimer);
    emitTyping(false);
    sendText(text);
  };

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    emitTyping(true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => emitTyping(false), 1500);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 860) { e.preventDefault(); submit(); }
  });
  fileInput.addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; sendFile(f); });

  pane.replaceChildren(
    el("header", { class: "appbar chat-head", id: "chat-head" }),
    el("div", { class: "msgs", id: "msgs" }),
    el("div", { class: "composer" },
      el("button", { class: "icon-btn", "aria-label": "إرفاق ملف", onclick: () => fileInput.click() }, icon("attach")),
      fileInput, input,
      el("button", { class: "icon-btn send", "aria-label": "إرسال", onclick: submit }, icon("send"))));

  renderHead();
  renderMessages();
}

export function renderHead() {
  const head = document.getElementById("chat-head");
  const user = state.active;
  if (!head || !user) return;

  const status = state.typing[user.id] ? el("span", { class: "accent" }, "يكتب الآن…")
    : isOnline(user.id) ? el("span", { class: "accent" }, "متصل الآن") : "غير متصل";

  const more = el("button", { class: "icon-btn", "aria-label": "المزيد" }, icon("more"));
  more.addEventListener("click", (e) => {
    e.stopPropagation();
    popupMenu(pointOf(more), [{
      label: "حظر المستخدم", icon: "block", danger: true,
      onClick: async () => {
        if (!confirm(`حظر ${user.name}؟`)) return;
        try { await blockUser(user); toast("تم الحظر"); } catch (err) { toast(err.message); }
      }
    }]);
  });

  head.replaceChildren(
    el("button", { class: "icon-btn back", "aria-label": "رجوع", onclick: closeChat }, icon("back")),
    avatar(user, "sm"),
    el("div", { class: "head-info" }, el("div", { class: "head-name" }, user.name), el("div", { class: "head-status" }, status)),
    more);
}

const mediaIsImage = (m) => /^image\//.test(m.fileType) || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(m.file);

function statusIcon(m) {
  const name = m.status === "read" || m.status === "delivered" ? "checks" : m.status === "sending" ? "clock" : m.status === "failed" ? "close" : "check";
  return el("span", { class: "tick" + (m.status === "read" ? " read" : m.status === "failed" ? " failed" : "") }, icon(name, 15));
}

function bubble(m) {
  const mine = same(m.from, state.me.id);
  const node = el("div", { class: "bubble " + (mine ? "out" : "in") + (m.deleted ? " deleted" : "") });

  if (m.deleted) node.append("🚫 تم حذف هذه الرسالة");
  else {
    if (m.file) {
      node.append(mediaIsImage(m)
        ? el("a", { href: m.file, target: "_blank", rel: "noopener" }, el("img", { class: "att", src: m.file, alt: "", loading: "lazy" }))
        : el("a", { class: "file", href: m.file, target: "_blank", rel: "noopener" }, icon("attach", 18), m.fileName || m.text || "ملف"));
    }
    if (m.text && !(m.file && m.text === m.fileName)) node.append(el("div", { class: "text" }, m.text));
    if (m.reactions) {
      const r = m.reactions;
      node.append(el("div", { class: "react" }, typeof r === "string" ? r : Array.isArray(r) ? r.map((x) => x.emoji || x).join(" ") : Object.keys(r).join(" ")));
    }
  }
  node.append(el("div", { class: "bubble-meta" }, m.edited ? "معدّلة" : "", fmtTime(m.at), mine ? statusIcon(m) : null));

  if (!m.deleted && m.id != null) onLongPress(node, (pt) => messageMenu(pt, m, mine));
  return node;
}

function messageMenu(pt, m, mine) {
  const run = (promise) => promise.catch((e) => toast(e.message));
  popupMenu(pt, [
    ...["👍", "❤️", "😂", "😮"].map((emoji) => ({ label: emoji + " تفاعل", onClick: () => run(reactToMessage(m, emoji)) })),
    m.text ? { label: "نسخ", onClick: () => { navigator.clipboard && navigator.clipboard.writeText(m.text); toast("تم النسخ"); } } : null,
    mine && m.text ? { label: "تعديل", onClick: () => {
      const text = prompt("تعديل الرسالة:", m.text);
      if (text && text.trim() && text.trim() !== m.text) run(editMessage(m, text.trim()));
    } } : null,
    mine ? { label: "حذف", danger: true, onClick: () => { if (confirm("حذف الرسالة؟")) run(deleteMessage(m)); } } : null
  ]);
}

export function renderMessages() {
  const box = document.getElementById("msgs");
  if (!box || !state.active) return;

  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  const list = state.msgs[state.active.id] || [];
  box.replaceChildren();

  if (!list.length) box.append(el("div", { class: "empty" }, el("span", { class: "empty-pill" }, "لا توجد رسائل بعد، قل مرحباً 👋")));

  let lastDay = "";
  for (const m of list) {
    const day = new Date(m.at).toDateString();
    if (day !== lastDay) { lastDay = day; box.append(el("div", { class: "day" }, el("span", null, dayLabel(m.at)))); }
    box.append(bubble(m));
  }
  if (nearBottom || list.length) box.scrollTop = box.scrollHeight;
}
