const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.JWT_SECRET = 'phase3-secret-that-is-long-enough-to-be-safe';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.DB_PATH = ':memory:';

const db = require('../src/db');
const { createServer } = require('../src/app');

function request(port, path, { method = 'GET', body, token } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      hostname: '127.0.0.1', port, path, method,
      headers: { ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
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

test('phase 3: migrations, profile, message actions, prefs, drafts and saved messages', async (t) => {
  const { server, io } = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  let sender, saver;
  t.after(async () => {
    try { sender?.disconnect(); } catch {}
    try { saver?.disconnect(); } catch {}
    try { io.close(); } catch {}
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  // Migration columns and tables exist.
  for (const [table, column] of [['users', 'display_name'], ['users', 'bio'], ['messages', 'edited_at'], ['messages', 'reply_to'], ['messages', 'reaction'], ['messages', 'deleted_for_all']]) {
    assert.ok(db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column), `missing ${table}.${column}`);
  }
  for (const table of ['chat_prefs', 'drafts', 'message_deletions']) {
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table), `missing ${table}`);
  }

  const alice = await request(port, '/api/register', { method: 'POST', body: { username: 'alice_p3', password: 'password-123' } });
  const bob = await request(port, '/api/register', { method: 'POST', body: { username: 'bob_user_p3', password: 'password-123' } });
  assert.equal(alice.status, 201);
  const a = alice.body.token;
  const b = bob.body.token;

  // Profile update and username availability.
  const profile = await request(port, '/api/profile', { method: 'PATCH', body: { display_name: 'Alice', bio: 'مرحباً', username: 'alice_new' }, token: a });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.display_name, 'Alice');
  assert.equal(profile.body.user.username, 'alice_new');
  const taken = await request(port, '/api/profile', { method: 'PATCH', body: { username: 'bob_user_p3' }, token: a });
  assert.equal(taken.status, 409);
  const found = await request(port, '/api/users/search?q=Alice', { token: b });
  assert.ok(found.body.users.some((u) => u.id === alice.body.user.id));

  // Prefs and drafts.
  assert.equal((await request(port, '/api/prefs', { method: 'POST', body: { peerId: bob.body.user.id, pinned: true, muted: true }, token: a })).status, 200);
  const prefs = await request(port, '/api/prefs', { token: a });
  assert.equal(prefs.body.prefs[bob.body.user.id].pinned, true);
  assert.equal((await request(port, '/api/drafts', { method: 'PUT', body: { peerId: bob.body.user.id, text: 'مسودة' }, token: a })).status, 200);
  assert.equal((await request(port, '/api/drafts', { token: a })).body.drafts[bob.body.user.id], 'مسودة');

  // Send a message through Socket.IO, then edit, react and delete it via REST.
  const { io: connect } = require('socket.io-client');
  sender = connect(`http://127.0.0.1:${port}`, { auth: { token: a }, reconnection: false, timeout: 5000 });
  await new Promise((resolve, reject) => { sender.once('connect', resolve); sender.once('connect_error', reject); });
  const sent = await new Promise((resolve, reject) => {
    sender.timeout(3000).emit('message:send', { to: bob.body.user.id, text: 'أصلي' }, (err, reply) => err ? reject(err) : resolve(reply));
  });
  assert.equal(sent.message.text, 'أصلي');
  const id = sent.message.id;

  const edited = await request(port, `/api/messages/${id}/edit`, { method: 'POST', body: { text: 'معدّلة' }, token: a });
  if (!edited.body?.message) console.error('EDIT RESPONSE:', JSON.stringify(edited));
  assert.equal(edited.body.message.text, 'معدّلة');
  assert.ok(edited.body.message.edited_at);
  const reacted = await request(port, `/api/messages/${id}/react`, { method: 'POST', body: { reaction: '👍' }, token: b });
  assert.equal(reacted.body.reaction, '👍');
  const history = await request(port, `/api/messages/${bob.body.user.id}`, { token: a });
  assert.equal(history.body.messages[0].text, 'معدّلة');
  assert.equal(history.body.messages[0].reaction, '👍');

  const deleted = await request(port, `/api/messages/${id}/delete`, { method: 'POST', body: { mode: 'everyone' }, token: a });
  assert.equal(deleted.status, 200);
  assert.equal((await request(port, `/api/messages/${bob.body.user.id}`, { token: a })).body.messages.length, 0);
  sender.disconnect();

  // Saved messages to self.
  saver = connect(`http://127.0.0.1:${port}`, { auth: { token: a }, reconnection: false, timeout: 5000 });
  await new Promise((resolve, reject) => { saver.once('connect', resolve); saver.once('connect_error', reject); });
  const note = await new Promise((resolve, reject) => {
    saver.timeout(3000).emit('message:send', { to: alice.body.user.id, text: 'ملاحظة لنفسي' }, (err, reply) => err ? reject(err) : resolve(reply));
  });
  assert.equal(note.message.text, 'ملاحظة لنفسي');
  const saved = await request(port, '/api/saved-messages', { token: a });
  assert.equal(saved.body.messages.length, 1);
  saver.disconnect();

  // Auth bypass: cannot edit someone else's message.
  const bypass = await request(port, `/api/messages/${edited.body.message.id}/edit`, { method: 'POST', body: { text: 'قرصنة' }, token: b });
  assert.equal(bypass.status, 404);
});
