import { state, bus } from "../../core/state.js";
import { toggleNotifications } from "../../core/notify.js";
import { listSessions, endSession, listBlocks, unblock } from "../../core/account.js";
import { el, icon, avatar, openPage, setTheme, fmtTime, toast } from "../dom.js";

function item(iconName, label, trailing, onclick, extraClass = "") {
  return el("button", { class: "setting " + extraClass, onclick },
    el("span", { class: "setting-icon" }, icon(iconName, 22)),
    el("span", { class: "setting-label" }, label),
    trailing || null);
}

function toggleSwitch(on, onChange) {
  const sw = el("span", { class: "switch" + (on ? " on" : ""), role: "switch", "aria-checked": String(on) });
  return { node: sw, set(v) { sw.classList.toggle("on", v); sw.setAttribute("aria-checked", String(v)); } };
}

export function renderSettings(box) {
  const me = state.me;

  const themeSwitch = toggleSwitch(state.theme === "dark");
  const notifySwitch = toggleSwitch(state.notify);

  box.replaceChildren(
    el("button", { class: "card account-card", onclick: () => { state.tab = "profile"; bus.emit("tab"); } },
      avatar(me, "lg"),
      el("div", null, el("div", { class: "profile-name" }, me.name), el("div", { class: "muted" }, "@" + me.username))),

    el("div", { class: "card group" },
      item("moon", "الوضع الداكن", themeSwitch.node, () => {
        setTheme(state.theme === "dark" ? "light" : "dark");
        themeSwitch.set(state.theme === "dark");
      }),
      item("bell", "إشعارات الرسائل", notifySwitch.node, async () => notifySwitch.set(await toggleNotifications()))),

    el("div", { class: "card group" },
      item("block", "المستخدمون المحظورون", null, openBlocked),
      item("devices", "الجلسات النشطة", null, openSessions)),

    el("div", { class: "card group" },
      item("logout", "تسجيل الخروج", null, () => bus.emit("logout"), "danger")),

    el("div", { class: "muted center" }, "Bird 2.0"));
}

function openBlocked() {
  openPage("المستخدمون المحظورون", async (body) => {
    const draw = async () => {
      try {
        const blocks = await listBlocks();
        body.replaceChildren(...(blocks.length ? blocks.map((b) =>
          el("div", { class: "row static" }, avatar(b.user),
            el("div", { class: "row-info" }, el("div", { class: "row-name" }, b.user.name)),
            el("button", { class: "link-btn inline", onclick: async () => { try { await unblock(b.id); draw(); } catch (e) { toast(e.message); } } }, "إلغاء الحظر")))
          : [el("div", { class: "empty" }, "لا يوجد مستخدمون محظورون")]));
      } catch (e) { body.replaceChildren(el("div", { class: "empty" }, "تعذّر تحميل القائمة")); }
    };
    draw();
  });
}

function openSessions() {
  openPage("الجلسات النشطة", async (body) => {
    const draw = async () => {
      try {
        const sessions = await listSessions();
        body.replaceChildren(...(sessions.length ? sessions.map((s) =>
          el("div", { class: "row static" },
            el("span", { class: "setting-icon" }, icon("devices", 22)),
            el("div", { class: "row-info" },
              el("div", { class: "row-name" }, String(s.device).slice(0, 60)),
              el("div", { class: "row-sub" }, s.at ? fmtTime(new Date(s.at).getTime()) : "")),
            s.current ? el("span", { class: "ok" }, "هذا الجهاز")
              : el("button", { class: "link-btn inline danger", onclick: async () => { try { await endSession(s.id); draw(); } catch (e) { toast(e.message); } } }, "إنهاء")))
          : [el("div", { class: "empty" }, "لا توجد جلسات")]));
      } catch (e) { body.replaceChildren(el("div", { class: "empty" }, "تعذّر تحميل الجلسات")); }
    };
    draw();
  });
}
