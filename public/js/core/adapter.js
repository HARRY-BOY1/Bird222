// طبقة التحويل الوحيدة بين شكل بيانات الخادم وشكل بيانات الواجهة.
// إذا اختلفت أسماء الحقول عندك، عدّلها هنا فقط.

import { LS } from "./storage.js";

export const pick = (obj, keys, fallback) => {
  if (!obj) return fallback;
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return fallback;
};

export const same = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

export const asList = (res, ...keys) =>
  Array.isArray(res) ? res : (keys.map((k) => res && res[k]).find(Array.isArray) || []);

// SQLite يخزّن CURRENT_TIMESTAMP بتوقيت UTC بدون علامة المنطقة
export function toTime(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return Number(value);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return Date.parse(value.replace(" ", "T") + "Z");
    const t = Date.parse(value);
    if (!isNaN(t)) return t;
  }
  return Date.now();
}

function protectedUrl(value) {
  if (!value || /^(https?:|data:|blob:)/.test(value)) return value || "";
  const token = LS.get("token", "");
  return token && value.startsWith("/files/") ? value + (value.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token) : value;
}

export function normUser(u) {
  if (!u) return null;
  return {
    id: pick(u, ["id", "user_id", "userId"]),
    username: pick(u, ["username", "user_name", "handle"], ""),
    name: pick(u, ["display_name", "displayName", "name", "full_name", "username"], "مستخدم"),
    bio: pick(u, ["bio", "about", "status_text"], ""),
    avatar: protectedUrl(pick(u, ["avatar_url", "avatarUrl", "avatar", "photo"], "")),
    online: !!pick(u, ["online", "is_online"], false),
    last: pick(u, ["last_message", "lastMessage"], null),
    unread: pick(u, ["unread", "unread_count", "unreadCount"], 0)
  };
}

export function normMsg(m) {
  if (!m) return null;
  const file = pick(m, ["file_url", "fileUrl", "attachment", "file", "media_url", "url"], "");
  const attachmentUrl = m.attachment_id ? protectedUrl("/files/" + m.attachment_id) : "";
  return {
    id: pick(m, ["id", "message_id", "_id"]),
    tempId: pick(m, ["tempId", "temp_id", "clientId"], null),
    from: pick(m, ["sender_id", "senderId", "from", "from_id"]),
    to: pick(m, ["receiver_id", "receiverId", "to", "to_id", "recipient_id"]),
    text: pick(m, ["text", "content", "body", "message"], ""),
    file: typeof file === "string" && file ? protectedUrl(file) : attachmentUrl,
    fileName: pick(m, ["file_name", "fileName", "filename"], ""),
    fileType: pick(m, ["file_type", "fileType", "mime", "mime_type"], ""),
    status: pick(m, ["status"], "sent"),
    at: toTime(pick(m, ["created_at", "createdAt", "timestamp", "time", "at"], Date.now())),
    edited: !!pick(m, ["edited", "is_edited", "edited_at"], false),
    deleted: !!pick(m, ["deleted", "is_deleted", "deleted_at"], false),
    reactions: pick(m, ["reactions", "reaction"], null)
  };
}
