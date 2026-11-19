/* Service worker: يخزّن هيكل الواجهة فقط. لا يلمس أي طلب للباك-إند أو بيانات المستخدم. */
const CACHE = "bird-shell-v3";
const NEVER_CACHE = ["/api", "/socket.io", "/uploads", "/files", "/avatars", "/health"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/css/styles.css", "/js/main.js", "/icon.svg"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (NEVER_CACHE.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) return;

  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
  );
});
