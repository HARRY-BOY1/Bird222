// One place to switch the server address.
// Local: http://localhost:3001 | Phone on same Wi-Fi: http://<computer-ip>:3001
// Production (Render): https://messenger-server-xxxx.onrender.com
const SERVER_URL = 'https://eminem-logs-parties-decide.trycloudflare.com';

function turnServers() {
  const url = window.TURN_URL && window.TURN_URL.trim();
  if (!url) return [];
  return [{
    urls: url.split(',').map((u) => u.trim()).filter(Boolean),
    username: window.TURN_USER || '',
    credential: window.TURN_PASS || '',
  }];
}

window.APP_CONFIG = Object.freeze({
  serverUrl: SERVER_URL,
  socketScriptUrl: `${SERVER_URL}/socket.io/socket.io.js`,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...turnServers(),
  ],
});
