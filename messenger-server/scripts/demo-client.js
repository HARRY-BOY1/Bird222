require('dotenv').config();
const { io } = require('socket.io-client');

const baseUrl = process.env.SERVER_URL || 'http://localhost:3001';
const suffix = Date.now().toString(36);

async function request(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, { auth: { token }, reconnection: false, timeout: 5000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

async function main() {
  const alice = await request('/api/register', { username: `alice_${suffix}`, password: 'demo-pass-123' });
  const bob = await request('/api/register', { username: `bob_${suffix}`, password: 'demo-pass-123' });
  const bobSocket = await connect(bob.token);
  const aliceSocket = await connect(alice.token);
  try {
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the message')), 5000);
      bobSocket.once('message:new', (message) => { clearTimeout(timer); resolve(message); });
    });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for the send acknowledgement')), 5000);
      aliceSocket.emit('message:send', { to: bob.user.id, text: 'Hello from the demo client!' }, (reply) => {
        clearTimeout(timer);
        reply?.error ? reject(new Error(reply.error)) : resolve(reply);
      });
    });
    const message = await received;
    console.log('Sent:', result.message);
    console.log('Received by Bob:', message);
  } finally {
    aliceSocket.disconnect();
    bobSocket.disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
