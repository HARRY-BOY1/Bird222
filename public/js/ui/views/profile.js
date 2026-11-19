import { state } from "../../core/state.js";
import { updateProfile, uploadAvatar } from "../../core/account.js";
import { el, icon, avatar, toast } from "../dom.js";

export function renderProfile(box) {
  const me = state.me;
  const head = el("div", { class: "profile-head" });
  const drawHead = () => head.replaceChildren(avatar(me, "xl"), el("div", { class: "profile-name" }, me.name), el("div", { class: "muted" }, "@" + me.username));
  drawHead();

  const picker = el("input", { type: "file", accept: "image/*", class: "hidden", onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try { await uploadAvatar(file); drawHead(); toast("تم تحديث الصورة"); } catch (err) { toast(err.message); }
  } });

  const name = el("input", { value: me.name, maxlength: 50 });
  const bio = el("input", { value: me.bio || "", maxlength: 140, placeholder: "اكتب نبذة قصيرة" });
  const error = el("div", { class: "form-error" });
  const save = el("button", { class: "btn", onclick: async () => {
    error.textContent = "";
    const value = name.value.trim();
    if (!value) { error.textContent = "الاسم مطلوب"; return; }
    save.disabled = true;
    try { await updateProfile({ name: value, bio: bio.value.trim() }); drawHead(); toast("تم الحفظ"); }
    catch (err) { error.textContent = err.message; }
    save.disabled = false;
  } }, "حفظ التغييرات");

  box.replaceChildren(
    el("div", { class: "card" }, head,
      el("button", { class: "btn ghost", onclick: () => picker.click() }, icon("camera", 20), "تغيير الصورة"), picker),
    el("div", { class: "card" },
      el("label", { class: "field" }, el("span", null, "الاسم الظاهر"), name),
      el("label", { class: "field" }, el("span", null, "النبذة"), bio),
      error, save));
}
