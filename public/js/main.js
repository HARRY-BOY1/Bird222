import { state, bus } from "./core/state.js";
import { connectSocket } from "./core/socket.js";
import { loadContacts } from "./core/contacts.js";
import { refreshMe, resetSession } from "./core/session.js";
import { markRead } from "./core/socket.js";
import { applyTheme, toast } from "./ui/dom.js";
import { renderAuth } from "./ui/auth.js";
import { mountShell } from "./ui/shell.js";

const root = document.getElementById("app");

function showAuth() {
  document.querySelectorAll(".page, .menu").forEach((n) => n.remove());
  renderAuth(root);
}

async function start() {
  mountShell(root);
  connectSocket();
  refreshMe();
  await loadContacts();
}

bus.on("notice", toast);
bus.on("authenticated", start);
bus.on("logout", () => { resetSession(); showAuth(); });
bus.on("session-expired", () => {
  if (!state.token) return;
  resetSession();
  showAuth();
  toast("انتهت الجلسة، سجّل الدخول من جديد");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.active) markRead(state.active.id);
});

applyTheme();
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

if (state.token && state.me) start(); else showAuth();
