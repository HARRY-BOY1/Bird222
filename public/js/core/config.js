// إعدادات الواجهة. لا يوجد هنا أي عنوان للباك-إند:
// API_BASE فارغ = نفس الدومين، والخادم الوسيط (server.js) يمرّر الطلبات.
export const CONFIG = Object.freeze({
  APP_NAME: "Bird",
  API_BASE: "",
  MAX_FILE: 50 * 1024 * 1024,
  SOCKET_FALLBACK_CDN: "https://cdn.socket.io/4.7.5/socket.io.min.js"
});
