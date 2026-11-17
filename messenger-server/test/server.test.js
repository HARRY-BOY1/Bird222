const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { io: createClient } = require('socket.io-client');

process.env.JWT_SECRET = 'test-secret-that-is-long-enough-to-be-safe';
process.env.CORS_ORIGIN = 'http://localhost:3000,http://127.0.0.1:9999';
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
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function connect(url, token) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, { auth: { token }, reconnection: false, timeout: 3000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

test('register, authenticate, and exchange a real-time message', async (t) => {
  const { server } = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });

  const alice = await request(port, '/api/register', { method: 'POST', body: { username: 'alice', password: 'password-123' } });
  const bob = await request(port, '/api/register', { method: 'POST', body: { username: 'bob', password: 'password-123' } });
  assert.equal(alice.status, 201);
  assert.equal(bob.status, 201);
  assert.equal((await request(port, '/api/contacts')).status, 401);
  assert.equal((await request(port, '/health')).status, 200);
  assert.deepEqual((await request(port, '/health')).body, { ok: true });

  const preflight = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/contacts',
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:9999', 'access-control-request-method': 'GET' },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(preflight.headers['access-control-allow-origin'], 'http://127.0.0.1:9999');

  const contact = await request(port, '/api/contacts', { method: 'POST', body: { contactId: bob.body.user.id }, token: alice.body.token });
  assert.equal(contact.status, 201);
  assert.equal((await request(port, '/api/contacts', { token: alice.body.token })).body.contacts.length, 1);

  const bobSocket = await connect(url, bob.body.token);
  const aliceSocket = await connect(url, alice.body.token);
  sockets.push(bobSocket, aliceSocket);
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message was not delivered')), 3000);
    bobSocket.once('message:new', (message) => { clearTimeout(timer); resolve(message); });
  });
  const sent = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Missing send acknowledgement')), 3000);
    aliceSocket.emit('message:send', { to: bob.body.user.id, text: 'Hello!' }, (reply) => {
      clearTimeout(timer);
      reply?.error ? reject(new Error(reply.error)) : resolve(reply.message);
    });
  });
  const delivered = await received;
  assert.equal(sent.text, 'Hello!');
  assert.equal(delivered.id, sent.id);
  assert.equal(sent.status, 'delivered');

  const history = await request(port, `/api/messages/${bob.body.user.id}`, { token: alice.body.token });
  assert.equal(history.body.messages.length, 1);
  assert.equal(history.body.messages[0].id, sent.id);

  const callId = `test-call-${Date.now()}`;
  const incoming = new Promise((resolve) => bobSocket.once('call:incoming', resolve));
  const offerReceived = new Promise((resolve) => bobSocket.once('call:signal', resolve));
  const outgoingOffer = { to: bob.body.user.id, callId, signal: { type: 'offer', data: { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' } } };
  aliceSocket.emit('call:start', { to: bob.body.user.id, kind: 'video', callId });
  aliceSocket.emit('call:signal', outgoingOffer);
  const incomingPayload = await incoming;
  const offerPayload = await offerReceived;
  assert.equal(incomingPayload.callId, callId);
  assert.equal(incomingPayload.kind, 'video');
  assert.equal(incomingPayload.username, 'alice');
  assert.equal(incomingPayload.from, alice.body.user.id);
  assert.equal(offerPayload.callId, callId);
  assert.equal(offerPayload.signal.data.sdp, outgoingOffer.signal.data.sdp);

  const answered = new Promise((resolve) => aliceSocket.once('call:answered', resolve));
  const answerReceived = new Promise((resolve) => aliceSocket.once('call:signal', resolve));
  bobSocket.emit('call:answer', { to: alice.body.user.id, callId, accepted: true });
  bobSocket.emit('call:signal', { to: alice.body.user.id, callId, signal: { type: 'answer', data: { type: 'answer', sdp: 'answer-sdp' } } });
  assert.equal((await answered).accepted, true);
  assert.equal((await answerReceived).signal.data.sdp, 'answer-sdp');

  const candidateReceived = new Promise((resolve) => aliceSocket.once('call:signal', resolve));
  bobSocket.emit('call:signal', { to: alice.body.user.id, callId, signal: { type: 'candidate', data: { candidate: 'candidate:0 1 UDP 2130706431 192.0.2.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } } });
  assert.equal((await candidateReceived).signal.data.sdpMid, '0');

  const ended = new Promise((resolve) => aliceSocket.once('call:ended', resolve));
  bobSocket.emit('call:end', { to: alice.body.user.id, callId });
  assert.equal((await ended).callId, callId);
});
