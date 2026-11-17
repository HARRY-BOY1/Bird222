// اختبار الميزات الجديدة عبر خادم عام: رفع، فيديو، ملف، ملصق، ورفض > 50MB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { io } = require('socket.io-client');

const BASE = process.argv[2] || 'http://127.0.0.1:3001';
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const client = () => (BASE.startsWith('https:') ? https : http);

function request(pathname, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = client().request(`${BASE}${pathname}`, {
      method,
      headers: {
        ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function upload(pathname, buffer, { filename, mime, token } = {}) {
  return new Promise((resolve, reject) => {
    const boundary = `----bird${Date.now()}${Math.random().toString(16).slice(2)}`;
    const head = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const req = client().request(`${BASE}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': head.length + buffer.length + tail.length,
        authorization: `Bearer ${token}`,
      },
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.write(head); req.write(buffer); req.end(tail);
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 10000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => { socket.close(); reject(error); });
    setTimeout(() => { if (!socket.connected) { socket.close(); reject(new Error('socket connect timeout')); } }, 15000).unref();
  });
}

function sendMessage(socket, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(10000).emit('message:send', payload, (error, response) => resolve({ error, response }));
    setTimeout(() => reject(new Error(`no ack for ${payload.kind || 'text'}`)), 15000).unref();
  });
}

(async () => {
  const suffix = `${Date.now()}`;
  const alice = await request('/api/register', { method: 'POST', body: { username: `alice_${suffix}`, password: 'password-123' } });
  const bob = await request('/api/register', { method: 'POST', body: { username: `bob_${suffix}`, password: 'password-123' } });
  assert.equal(alice.status, 201, JSON.stringify(alice.body));
  assert.equal(bob.status, 201, JSON.stringify(bob.body));

  const a = await connect(alice.body.token);
  const b = await connect(bob.body.token);
  try {
    const image = await upload('/api/upload', Buffer.from('bird-image-test'), { filename: 'bird.png', mime: 'image/png', token: alice.body.token });
    assert.equal(image.status, 201, JSON.stringify(image.body));
    assert.ok(image.body.file.id);
    const imageId = image.body.file.id;

    const video = await upload('/api/upload', Buffer.alloc(2048, 7), { filename: 'clip.mp4', mime: 'video/mp4', token: alice.body.token });
    assert.equal(video.status, 201);
    const doc = await upload('/api/upload', Buffer.from('%PDF-1.4 bird'), { filename: 'report.pdf', mime: 'application/pdf', token: alice.body.token });
    assert.equal(doc.status, 201);
    const exe = await upload('/api/upload', Buffer.from('MZ fake exe'), { filename: 'virus.exe', mime: 'application/x-msdownload', token: alice.body.token });
    assert.equal(exe.status, 415, 'النوع غير المسموح يجب أن يُرفض');

    // رفض > 50MB (حتى لو كان النوع مسموحاً).
    const big = await upload('/api/upload', Buffer.alloc(50 * 1024 * 1024 + 1024, 1), { filename: 'big.png', mime: 'image/png', token: alice.body.token });
    assert.equal(big.status, 413, 'الملف الأكبر من 50MB يجب أن يُرفض');

    const sticker = await sendMessage(a, { to: bob.body.user.id, text: '', kind: 'sticker', sticker: 'red_heart' });
    assert.ok(!sticker.response?.error, JSON.stringify(sticker.response));
    assert.equal(sticker.response.message.kind, 'sticker');

    const photo = await sendMessage(a, { to: bob.body.user.id, text: 'شوف الصورة', kind: 'image', attachmentId: imageId });
    assert.ok(!photo.response?.error, JSON.stringify(photo.response));
    assert.equal(photo.response.message.attachment_id, imageId);

    const videoMsg = await sendMessage(a, { to: bob.body.user.id, text: '', kind: 'video', attachmentId: video.body.file.id });
    assert.ok(!videoMsg.response?.error, JSON.stringify(videoMsg.response));
    const docMsg = await sendMessage(a, { to: bob.body.user.id, text: '', kind: 'file', attachmentId: doc.body.file.id });
    assert.ok(!docMsg.response?.error, JSON.stringify(docMsg.response));

    // لا يمكن استخدام مرفق لا يخص المستخدم.
    const stolen = await sendMessage(b, { to: alice.body.user.id, text: '', kind: 'image', attachmentId: imageId });
    assert.match(String(stolen.response?.error || ''), /لا يخصك|غير موجود/);

    const fake = await sendMessage(a, { to: bob.body.user.id, text: '', kind: 'image', attachmentId: 'a'.repeat(32) });
    assert.match(String(fake.response?.error || ''), /لا يخصك|غير موجود/);

    const empty = await sendMessage(a, { to: bob.body.user.id, text: '', kind: 'image' });
    assert.match(String(empty.response?.error || ''), /المرفق مفقود/);

    // الرسائل تُقرأ من الـ API مع حقول المرفق.
    const history = await request(`/api/messages/${bob.body.user.id}`, { token: bob.body.token });
    assert.equal(history.status, 200, JSON.stringify(history.body));
    const kinds = history.body.messages.map((m) => m.kind);
    assert.ok(kinds.includes('sticker') && kinds.includes('image') && kinds.includes('video') && kinds.includes('file'), JSON.stringify(kinds));

    // الملف يُخدم بالتوكن فقط.
    const fetchText = async (pathname, token) => {
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const response = await fetch(`${BASE}${pathname}`, { headers });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch { /* binary */ }
      return { status: response.status, body, text };
    };
    const noToken = await fetchText(`/files/${imageId}`);
    assert.equal(noToken.status, 401);
    const badToken = await fetchText(`/files/${imageId}`, 'bad');
    assert.equal(badToken.status, 401);
    const withToken = await fetch(`/files/${imageId}?token=${encodeURIComponent(alice.body.token)}`);
    assert.equal(withToken.status, 200);
    assert.match(withToken.headers.get('content-type') || '', /image\/png/);
    await withToken.arrayBuffer();

    console.log('PASS: upload, kind detection, 50MB limit, mime allowlist, sticker, ownership, history, file serving');
  } finally {
    a.disconnect(); b.disconnect();
  }
})().catch((error) => { console.error('FAIL:', error.message); process.exit(1); });