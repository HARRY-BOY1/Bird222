import { state, bus } from "./state.js";
import { same } from "./adapter.js";
import { LS } from "./storage.js";

export function notifyMessage(m, peer) {
  if (!state.notify || !("Notification" in window) || Notification.permission !== "granted") return;
  const user = state.contacts.find((c) => same(c.id, peer));
  try { new Notification(user ? user.name : "رسالة جديدة", { body: m.text || "مرفق", icon: "/icon.svg" }); } catch (e) { /* تجاهل */ }
}

export async function toggleNotifications() {
  if (!("Notification" in window)) { bus.emit("notice", "المتصفح لا يدعم الإشعارات"); return state.notify; }
  if (state.notify) state.notify = false;
  else state.notify = (await Notification.requestPermission()) === "granted";
  LS.set("notify", state.notify);
  return state.notify;
}
