import { api } from "./api.js";
import { state, bus } from "./state.js";
import { LS } from "./storage.js";
import { asList, normUser, pick } from "./adapter.js";

function saveMe() { LS.set("me", state.me); bus.emit("me"); }

export async function updateProfile({ name, bio }) {
  const res = await api.patch("/api/profile", { display_name: name, bio });
  const user = normUser((res && res.user) || res);
  state.me.name = name; state.me.bio = bio;
  if (user && user.id != null) { state.me.name = user.name || name; state.me.bio = user.bio ?? bio; }
  saveMe();
}

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append("avatar", file);
  form.append("file", file);
  const res = await api.upload("/api/me/avatar", form);
  const user = normUser((res && res.user) || res);
  const url = (user && user.avatar) || pick(res, ["url", "avatar_url", "avatar"], "");
  if (url) state.me.avatar = url;
  saveMe();
}

export async function listSessions() {
  const res = await api.get("/api/sessions");
  return asList(res, "sessions", "data").map((s) => ({
    id: s.id,
    current: !!s.current,
    device: pick(s, ["device", "user_agent", "userAgent", "name"], "جهاز"),
    at: pick(s, ["last_active", "created_at", "createdAt"], null)
  }));
}
export const endSession = (id) => api.del("/api/sessions/" + id);

export async function listBlocks() {
  const res = await api.get("/api/blocks");
  return asList(res, "blocks", "users", "data").map((b) => {
    const user = normUser(b.user || b);
    return { id: pick(b, ["blocked_id", "user_id", "id"], user.id), user };
  });
}
export const unblock = (id) => api.del("/api/blocks/" + id);
