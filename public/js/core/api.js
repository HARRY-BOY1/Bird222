import { CONFIG } from "./config.js";
import { state, bus } from "./state.js";

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (auth && state.token) headers.Authorization = "Bearer " + state.token;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }

  let res;
  try { res = await fetch(CONFIG.API_BASE + path, { method, headers, body }); }
  catch (e) { throw new ApiError("تعذّر الاتصال بالخادم", 0); }

  let data = null;
  try { data = await res.json(); } catch (e) { /* رد بدون JSON */ }

  if (res.status === 401 && auth && state.token) {
    bus.emit("session-expired");
    throw new ApiError("انتهت الجلسة", 401);
  }
  if (!res.ok) throw new ApiError((data && (data.error || data.message)) || `خطأ (${res.status})`, res.status);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body, opts) => request(path, { method: "POST", body: body ?? {}, ...opts }),
  patch: (path, body) => request(path, { method: "PATCH", body: body ?? {} }),
  del: (path) => request(path, { method: "DELETE" }),
  upload: (path, form) => request(path, { method: "POST", body: form })
};
