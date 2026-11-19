import { api } from "./api.js";
import { state, bus } from "./state.js";
import { LS } from "./storage.js";
import { normUser, pick } from "./adapter.js";
import { disconnectSocket } from "./socket.js";

async function requestToken(mode, { username, password, name }) {
  const body = mode === "register"
    ? { username, password }
    : { username, password };
  return api.post(mode === "register" ? "/api/register" : "/api/login", body, { auth: false });
}

export async function authenticate(mode, creds) {
  let res = await requestToken(mode, creds);
  let token = pick(res, ["token", "accessToken", "jwt"]);

  // بعض الخوادم لا ترجع توكن عند التسجيل: نسجّل الدخول مباشرة
  if (!token && mode === "register") {
    res = await requestToken("login", creds);
    token = pick(res, ["token", "accessToken", "jwt"]);
  }
  if (!token) throw new Error("استجابة غير متوقعة من الخادم");

  state.token = token;
  LS.set("token", token);

  let me = res.user || res.me;
  if (!me) { const r = await api.get("/api/me"); me = r.user || r; }
  state.me = normUser(me);
  LS.set("me", state.me);
}

export async function refreshMe() {
  try {
    const res = await api.get("/api/me");
    const me = normUser(res.user || res);
    if (me && me.id != null) { state.me = me; LS.set("me", me); bus.emit("me"); }
  } catch (e) { /* الجلسة تُعالج في api.js */ }
}

export function resetSession() {
  disconnectSocket();
  state.token = null; state.me = null;
  state.contacts = []; state.msgs = {}; state.unread = {}; state.typing = {};
  state.online.clear(); state.active = null; state.query = ""; state.remote = null;
  state.tab = "chats"; state.filter = "all";
  LS.del("token"); LS.del("me");
}
