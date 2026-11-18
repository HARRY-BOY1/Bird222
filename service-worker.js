const CACHE_NAME = 'bird-shell-v11';
const APP_SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './css/styles.css',
  './css/aurora-overrides.css',
  './js/stickers.js',
  './js/ui.js',
  './js/api.js',
  './js/socket.js',
  './js/app.js',
  './js/health.js',
  './icons/icon-192.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // API, Socket.IO, and cross-origin resources are never intercepted or cached.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/health')) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  }).catch(async () => (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { body: event.data?.text() || 'رسالة جديدة' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Bird', { body: data.body || 'لديك رسالة جديدة', tag: data.tag || 'bird-message', icon: './icons/icon-192.png', badge: './icons/icon-192.png', dir: 'rtl', data: data.data || { url: './' } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.peerId ? `./?chat=${encodeURIComponent(data.peerId)}` : (data.url || './');
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => { const client = clients.find((item) => 'focus' in item); return client ? client.focus() : self.clients.openWindow(target); }));
});
