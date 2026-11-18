const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

assert.match(html, /<html lang="ar" dir="rtl"(?: data-theme="dark")?>/);
assert.match(html, /js\/api\.js/);
assert.match(html, /js\/socket\.js/);
assert.match(app, /SocketService\.read\(/);
assert.match(app, /SocketService\.delivered\(/);
assert.match(ui, /text\.textContent = message\.text/);
assert.doesNotMatch(ui, /innerHTML/);
assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
assert.match(sw, /url\.pathname\.startsWith\('\/socket.io\/'\)/);
assert.match(sw, /bird-shell-v11/);
assert.match(sw, /js\/stickers\.js/);
assert.match(html, /js\/stickers\.js/);
assert.match(html, /id="file-input"/);
assert.match(html, /id="sticker-grid"/);
assert.match(app, /uploadFile\(/);
assert.match(app, /maxUploadBytes/);
assert.match(app, /kind: 'sticker'/);
assert.match(sw, /event\.respondWith\(fetch\(request\)/);
assert.match(ui, /function getDisplayName/);
assert.doesNotMatch(app, /مستخدم \$\{/);
assert.match(app, /users: new Map/);
assert.match(app, /function cacheUser/);
assert.match(app, /getDisplayName\(/);
for (const id of ['drawer', 'compose-fab', 'nav-chats', 'nav-contacts', 'nav-settings', 'nav-profile', 'voice-call-button', 'video-call-button', 'call-layer', 'remote-video', 'local-video', 'accept-call-button', 'hangup-call-button']) {
  assert.match(html, new RegExp(`id="${id}"`));
}
assert.match(html, /data-drawer="calls"/);
for (const font of ['cairo-400-arabic.woff2', 'inter-400-latin.woff2', 'pacifico-400-latin.woff2']) {
  assert.ok(fs.existsSync(path.join(root, 'fonts', font)), `missing font ${font}`);
}
assert.ok(fs.statSync(path.join(root, 'assets/icons.svg')).size > 1000);
assert.equal(manifest.short_name, 'Bird');
assert.match(app, /createOffer\(/);
assert.match(app, /createAnswer\(/);
assert.match(app, /getUserMedia\(/);
assert.equal(manifest.display, 'standalone');
for (const size of [192, 512]) {
  const icon = fs.statSync(path.join(root, `icons/icon-${size}.png`));
  assert.ok(icon.size > 100, `icon-${size}.png should exist`);
}
console.log('PWA structure, XSS-safe message rendering, worker exclusions, and icons checked.');
