import { state, isOnline } from "../core/state.js";
import { same } from "../core/adapter.js";
import { startRecording } from "../core/voice.js";
import { EMOJIS } from "./emoji.js";
import { fileUrl, closeChat, sendText, sendFile, emitTyping, editMessage, deleteMessage, reactToMessage, blockUser } from "../core/chat.js";
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

  const panel = el("div", { class: "emoji-panel hidden" }, EMOJIS.map((e) => el("button", { type: "button", onclick: () => {
    input.setRangeText(e, input.selectionStart, input.selectionEnd, "end"); input.focus();
  } }, e)));
  let rec = null, tick = null;
  const timer = el("span", { class: "rec-time hidden" });
  const mic = el("button", { class: "icon-btn mic", "aria-label": "رسالة صوتية" }, icon("mic"));
  const resetMic = () => { rec = null; clearInterval(tick); mic.classList.remove("rec"); timer.classList.add("hidden"); };
  mic.addEventListener("click", async () => {
    if (rec) {
      const r = rec; resetMic();
      const { blob, ms } = await r.stop();
      if (ms < 700) return toast("اضغط مطولاً لتسجيل أطول");
      sendFile(blob, "voice-" + Date.now() + "." + (blob.type.includes("mp4") ? "m4a" : "webm"));
      return;
    }
    try {
      rec = await startRecording();
      const t0 = Date.now();
      mic.classList.add("rec"); timer.classList.remove("hidden");
      tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = "● " + Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }, 250);
    } catch (e) { resetMic(); toast("اسمح للمتصفح باستخدام الميكروفون"); }
  });

  pane.replaceChildren(
    el("header", { class: "appbar chat-head", id: "chat-head" }),
    el("div", { class: "msgs", id: "msgs" }),
    panel,
    el("div", { class: "composer" },
      el("button", { class: "icon-btn", "aria-label": "إيموجي", onclick: () => panel.classList.toggle("hidden") }, icon("smile")),
      el("button", { class: "icon-btn", "aria-label": "إرفاق ملف", onclick: () => fileInput.click() }, icon("attach")),
      fileInput, input, timer, mic,
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

const mediaIsAudio = (m) => /^audio\//.test(m.fileType) || /^voice-/.test(m.fileName) || /\.(m4a|mp3|ogg|wav)(\?|$)/i.test(m.file);
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
      node.append(mediaIsAudio(m) ? el("audio", { class: "voice", controls: true, preload: "metadata", src: fileUrl(m.file) })
        : mediaIsImage(m)
        ? el("a", { href: fileUrl(m.file), target: "_blank", rel: "noopener" }, el("img", { class: "att", src: fileUrl(m.file), alt: "", loading: "lazy" }))
        : el("a", { class: "file", href: fileUrl(m.file), target: "_blank", rel: "noopener" }, icon("attach", 18), m.fileName || m.text || "ملف"));
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
