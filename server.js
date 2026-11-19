"use strict";
/**
 * Bird gateway — بدون أي اعتماديات خارجية.
 *  - يقدّم ملفات الواجهة من public/
 *  - يمرّر /api و /socket.io و ملفات الرفع إلى الباك-إند (UPSTREAM_URL)
 *  - المتصفح لا يرى عنوان الباك-إند ولا ترويسات المزوّد أبداً
 */
const http = require("http");
const https = require("https");
const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

/* ---------- الإعدادات ---------- */
loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PROXY_PREFIXES = (process.env.PROXY_PREFIXES || "/api,/socket.io,/uploads,/files,/avatars,/health")
  .split(",").map((s) => s.trim()).filter(Boolean);

const UPSTREAM = parseUpstream(process.env.UPSTREAM_URL);
const SECURE_UPSTREAM = UPSTREAM.protocol === "https:";
const UPSTREAM_PORT = Number(UPSTREAM.port) || (SECURE_UPSTREAM ? 443 : 80);
const transport = SECURE_UPSTREAM ? https : http;

// ترويسات تكشف المزوّد أو البنية التحتية
const HIDDEN_HEADER = /^(server|x-powered-by|via|alt-svc|x-railway-[\w-]+|x-render-[\w-]+|x-vercel-[\w-]+|fly-[\w-]+|cf-[\w-]+)$/i;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://cdn.socket.io; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss:; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

/* ---------- الخادم ---------- */
const server = http.createServer((req, res) => {
  if (isProxied(req.url)) return proxyHttp(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
});
server.on("upgrade", proxyUpgrade);
server.listen(PORT, "0.0.0.0", () => console.log(`Bird gateway listening on :${PORT}`));

/* ---------- التمرير HTTP ---------- */
function proxyHttp(req, res) {
  const headers = Object.assign({}, req.headers);
  headers.host = UPSTREAM.host;
  if (headers.origin) headers.origin = UPSTREAM.origin;   // يجعل CORS غير مهم للباك-إند
  if (headers.referer) headers.referer = UPSTREAM.origin + "/";
  headers["accept-encoding"] = "identity";
  headers["x-forwarded-for"] = [req.headers["x-forwarded-for"], req.socket.remoteAddress].filter(Boolean).join(", ");
  delete headers["x-forwarded-host"];

  const up = transport.request(
    { hostname: UPSTREAM.hostname, port: UPSTREAM_PORT, method: req.method, path: req.url, headers },
    (ur) => {
      const out = cleanHeaders(ur.headers);
      if (out.location) out.location = String(out.location).split(UPSTREAM.origin).join("");
      if (/json/i.test(String(ur.headers["content-type"] || ""))) {
        // نحذف أي ذكر لعنوان الباك-إند داخل ردود JSON (مثل روابط الملفات)
        const chunks = [];
        ur.on("data", (c) => chunks.push(c));
        ur.on("end", () => {
          const body = Buffer.from(Buffer.concat(chunks).toString("utf8").split(UPSTREAM.origin).join(""), "utf8");
          delete out["transfer-encoding"];
          out["content-length"] = body.length;
          res.writeHead(ur.statusCode, out);
          res.end(body);
        });
      } else {
        res.writeHead(ur.statusCode, out);
        ur.pipe(res);
      }
    }
  );
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end('{"error":"service_unavailable"}');
  });
  req.pipe(up);
}

function cleanHeaders(h) {
  const out = {};
  for (const k of Object.keys(h)) if (!HIDDEN_HEADER.test(k)) out[k] = h[k];
  return out;
}

/* ---------- التمرير WebSocket ---------- */
function proxyUpgrade(req, socket, head) {
  if (!isProxied(req.url)) return socket.destroy();

  const up = SECURE_UPSTREAM
    ? tls.connect({ host: UPSTREAM.hostname, port: UPSTREAM_PORT, servername: UPSTREAM.hostname })
    : net.connect({ host: UPSTREAM.hostname, port: UPSTREAM_PORT });

  let buffered = Buffer.alloc(0);
  let handshakeDone = false;
  const kill = () => { up.destroy(); socket.destroy(); };

  up.once(SECURE_UPSTREAM ? "secureConnect" : "connect", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const name = req.rawHeaders[i], lower = name.toLowerCase();
      if (lower === "host") lines.push(`Host: ${UPSTREAM.host}`);
      else if (lower === "origin") lines.push(`Origin: ${UPSTREAM.origin}`);
      else lines.push(`${name}: ${req.rawHeaders[i + 1]}`);
    }
    up.write(lines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) up.write(head);
  });

  up.on("data", (chunk) => {
    if (handshakeDone) return void socket.write(chunk);
    buffered = Buffer.concat([buffered, chunk]);
    const end = buffered.indexOf("\r\n\r\n");
    if (end < 0) return;
    handshakeDone = true;
    const headLines = buffered.slice(0, end).toString("latin1").split("\r\n")
      .filter((line, i) => i === 0 || !HIDDEN_HEADER.test(line.split(":")[0].trim()));
    socket.write(headLines.join("\r\n") + "\r\n\r\n");
    const rest = buffered.slice(end + 4);
    if (rest.length) socket.write(rest);
  });
  socket.on("data", (chunk) => up.write(chunk));

  up.on("error", kill); socket.on("error", kill);
  up.on("close", () => socket.destroy()); socket.on("close", () => up.destroy());
}

/* ---------- الملفات الثابتة ---------- */
function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch (e) { res.writeHead(400); return res.end(); }

  let file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }

  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (readErr, data) => {
      if (!readErr) return send(req, res, file, data);
      if (path.extname(pathname)) { res.writeHead(404); return res.end("Not found"); }
      const index = path.join(PUBLIC_DIR, "index.html");               // مسارات الواجهة
      fs.readFile(index, (e2, d2) => (e2 ? (res.writeHead(500), res.end()) : send(req, res, index, d2)));
    });
  });
}

function send(req, res, file, data) {
  const ext = path.extname(file).toLowerCase();
  const noCache = ext === ".html" || path.basename(file) === "sw.js";
  res.writeHead(200, Object.assign({
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": data.length,
    "Cache-Control": noCache ? "no-cache" : "public, max-age=3600"
  }, SECURITY_HEADERS));
  res.end(req.method === "HEAD" ? undefined : data);
}

/* ---------- أدوات ---------- */
function isProxied(url) {
  const p = String(url).split("?")[0];
  return PROXY_PREFIXES.some((x) => p === x || p.startsWith(x + "/"));
}

function parseUpstream(value) {
  try { return new URL(value); }
  catch (e) {
    console.error("UPSTREAM_URL مفقود أو غير صالح. أضفه في متغيرات البيئة (انظر .env.example).");
    process.exit(1);
  }
}

function loadEnv(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
