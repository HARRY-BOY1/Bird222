import { state, bus } from "../core/state.js";
import { searchUsers } from "../core/contacts.js";
import { el, icon, avatar, popupMenu, pointOf, setTheme } from "./dom.js";
import { renderChats, matchesFilter } from "./views/chats.js";
import { renderContacts } from "./views/contacts.js";
import { renderSettings } from "./views/settings.js";
import { renderProfile } from "./views/profile.js";
import { mountChatPane, renderChatPane, renderHead, renderMessages } from "./chatpane.js";

const TABS = [
  { id: "chats", label: "المحادثات", icon: "chat" },
  { id: "contacts", label: "جهات الاتصال", icon: "contacts" },
  { id: "settings", label: "الإعدادات", icon: "settings" },
  { id: "profile", label: "الملف الشخصي", icon: "person" }
];
const TITLES = { chats: "Bird", contacts: "جهات الاتصال", settings: "الإعدادات", profile: "الملف الشخصي" };
const VIEWS = { chats: renderChats, contacts: renderContacts, settings: renderSettings, profile: renderProfile };
const FOLDERS = [
  { id: "all", label: "الكل" },
  { id: "unread", label: "غير المقروءة" },
  { id: "online", label: "المتصلون" }
];

const els = {};
let searching = false;
let wired = false;
let debounce;

export function mountShell(root) {
  els.shell = el("div", { class: "shell" });
  els.bar = el("header", { class: "appbar" });
  els.input = el("input", { type: "search", placeholder: "بحث…", "aria-label": "بحث", oninput: onQuery });
  els.search = el("div", { class: "searchbar hidden" }, els.input,
    el("button", { class: "icon-btn", "aria-label": "إغلاق البحث", onclick: () => toggleSearch(false) }, icon("close", 20)));
  els.folders = el("div", { class: "folders", role: "tablist" });
  els.view = el("section", { class: "view" });
  els.fab = el("button", { class: "fab", "aria-label": "محادثة جديدة", onclick: newChat }, icon("fab", 30));
  els.nav = el("nav", { class: "bottom-nav" });
  els.chat = el("main", { class: "chat-pane" });

  els.shell.append(el("aside", { class: "list-pane" }, els.bar, els.search, els.folders, els.view, els.fab, els.nav), els.chat);
  root.replaceChildren(els.shell);

  mountChatPane(els.chat);
  renderAll();
  if (!wired) { wire(); wired = true; }
}

function wire() {
  bus.on("list", () => { renderView(); renderFolders(); });
  bus.on("messages", renderMessages);
  bus.on("head", renderHead);
  bus.on("typing", () => { renderHead(); renderView(); });
  bus.on("conn", renderBar);
  bus.on("me", () => { renderBar(); if (state.tab === "profile" || state.tab === "settings") renderView(); });
  bus.on("tab", () => setTab(state.tab));
  bus.on("chat-open", () => {
    els.shell.classList.toggle("chat-open", !!state.active);
    renderChatPane();
  });
}

/* ---------- الرسم ---------- */
function renderAll() { renderBar(); renderFolders(); renderView(); renderNav(); renderFab(); }

function renderBar() {
  const canSearch = state.tab === "chats" || state.tab === "contacts";
  els.bar.replaceChildren(
    el("button", { class: "icon-btn me", "aria-label": "الملف الشخصي", onclick: () => setTab("profile") }, avatar(state.me, "sm")),
    el("h1", { class: "title" }, TITLES[state.tab], state.tab === "chats" && !state.connected ? el("small", { class: "conn" }, "جارٍ الاتصال…") : null),
    canSearch ? el("button", { class: "icon-btn", "aria-label": "بحث", onclick: () => toggleSearch() }, icon("search")) : null,
    el("button", { class: "icon-btn more", "aria-label": "المزيد", onclick: (e) => { e.stopPropagation(); openMore(e.currentTarget); } }, icon("more")));
}

function renderFolders() {
  els.folders.classList.toggle("hidden", state.tab !== "chats");
  if (state.tab !== "chats") return;
  const unreadCount = state.contacts.filter((u) => (state.unread[u.id] || 0) > 0).length;
  els.folders.replaceChildren(...FOLDERS.map((f) =>
    el("button", { class: "folder" + (state.filter === f.id ? " active" : ""), role: "tab", "aria-selected": String(state.filter === f.id),
      onclick: () => { state.filter = f.id; renderFolders(); renderView(); } },
      f.label, f.id === "unread" && unreadCount ? el("span", { class: "count" }, unreadCount) : null)));
}

function renderView() { VIEWS[state.tab](els.view); }

function renderNav() {
  els.nav.replaceChildren(...TABS.map((t) =>
    el("button", { class: "nav-btn" + (state.tab === t.id ? " active" : ""), onclick: () => setTab(t.id), "aria-label": t.label },
      icon(t.icon, 26), el("span", null, t.label))));
}

function renderFab() {
  els.fab.classList.toggle("hidden", state.tab !== "chats" && state.tab !== "contacts");
}

/* ---------- التفاعل ---------- */
function setTab(tab) {
  state.tab = tab;
  searching = false;
  els.search.classList.add("hidden");
  els.input.value = ""; state.query = ""; state.remote = null;
  els.view.scrollTop = 0;
  renderAll();
}

function toggleSearch(force) {
  searching = force === undefined ? !searching : force;
  els.search.classList.toggle("hidden", !searching);
  if (searching) els.input.focus();
  else { els.input.value = ""; state.query = ""; state.remote = null; renderView(); }
}

function onQuery(e) {
  state.query = e.target.value;
  clearTimeout(debounce);
  const q = state.query.trim();
  if (q.length < 2) { state.remote = null; renderView(); return; }
  renderView();
  debounce = setTimeout(async () => {
    const results = await searchUsers(q);
    if (state.query.trim() === q) { state.remote = results; renderView(); }
  }, 300);
}

function newChat() {
  if (state.tab !== "contacts") setTab("contacts");
  toggleSearch(true);
}

function openMore(button) {
  popupMenu(pointOf(button), [
    { label: "محادثة جديدة", icon: "fab", onClick: newChat },
    { label: state.theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن", icon: "moon", onClick: () => setTheme(state.theme === "dark" ? "light" : "dark") },
    { label: "الإعدادات", icon: "settings", onClick: () => setTab("settings") },
    { label: "تسجيل الخروج", icon: "logout", danger: true, onClick: () => bus.emit("logout") }
  ]);
}
