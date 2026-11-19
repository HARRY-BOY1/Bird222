import { bus } from "../core/state.js";
import { authenticate } from "../core/session.js";
import { el } from "./dom.js";

export function renderAuth(root) {
  let mode = "login";

  const error = el("div", { class: "form-error", role: "alert" });
  const username = el("input", { autocomplete: "username", autocapitalize: "none", spellcheck: "false", placeholder: "اسم المستخدم", dir: "ltr" });
  const name = el("input", { placeholder: "الاسم الظاهر" });
  const password = el("input", { type: "password", autocomplete: "current-password", placeholder: "كلمة المرور", dir: "ltr" });
  const nameField = el("label", { class: "field hidden" }, el("span", null, "الاسم الظاهر"), name);
  const subtitle = el("p", { class: "auth-sub" }, "سجّل الدخول للمتابعة");
  const submit = el("button", { class: "btn", type: "submit" }, "تسجيل الدخول");
  const toggle = el("button", { class: "link-btn", type: "button" }, "ليس لديك حساب؟ أنشئ حساباً");

  toggle.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    const register = mode === "register";
    nameField.classList.toggle("hidden", !register);
    password.setAttribute("autocomplete", register ? "new-password" : "current-password");
    submit.textContent = register ? "إنشاء الحساب" : "تسجيل الدخول";
    toggle.textContent = register ? "لديك حساب؟ سجّل الدخول" : "ليس لديك حساب؟ أنشئ حساباً";
    subtitle.textContent = register ? "أنشئ حسابك في ثوانٍ" : "سجّل الدخول للمتابعة";
    error.textContent = "";
  });

  const form = el("form", { novalidate: true },
    el("label", { class: "field" }, el("span", null, "اسم المستخدم"), username),
    nameField,
    el("label", { class: "field" }, el("span", null, "كلمة المرور"), password),
    error, submit, toggle);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.textContent = "";
    const u = username.value.trim(), p = password.value;
    if (!u || !p) { error.textContent = "أدخل اسم المستخدم وكلمة المرور"; return; }
    if (mode === "register" && p.length < 8) { error.textContent = "كلمة المرور 8 أحرف على الأقل"; return; }
    submit.disabled = true;
    try {
      await authenticate(mode, { username: u, password: p, name: name.value.trim() });
      bus.emit("authenticated");
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  root.replaceChildren(
    el("div", { class: "auth" },
      el("div", { class: "auth-card" },
        el("img", { class: "auth-logo", src: "/icon.svg", alt: "Bird" }),
        el("h1", null, "Bird"), subtitle, form)));
}
