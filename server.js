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
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://cdn.socket.io; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss:; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

/* ---------- الخادم ---------- */
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/x/")) return handleX(req, res);
  if (isProxied(req.url)) return proxyHttp(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
});
server.on("upgrade", proxyUpgrade);
server.listen(PORT, "0.0.0.0", () => console.log(`Bird gateway listening on :${PORT}`));

/* ---------- امتدادات Bird: صور الملف الشخصي والمرفقات (حتى 50MB) ---------- */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const MAX_FILE = 50 * 1024 * 1024, MAX_AVATAR = 5 * 1024 * 1024;
const AV_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const FILE_MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  webm: "audio/webm", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav", pdf: "application/pdf" };
const INLINE = /^(image|audio)\//;
["avatars", "files"].forEach((d) => fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true }));
const authCache = new Map();

function checkToken(token) {   // يتحقق من الجلسة عبر الباك-إند ثم يقرأ رقم المستخدم من التوكن
  if (!token) return Promise.resolve(null);
  const hit = authCache.get(token);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.id);
  return new Promise((resolve) => {
    const r = transport.request({ hostname: UPSTREAM.hostname, port: UPSTREAM_PORT, path: "/api/contacts", method: "GET",
      headers: { host: UPSTREAM.host, authorization: "Bearer " + token } }, (ur) => {
      ur.resume();
      if (ur.statusCode !== 200) return resolve(null);
      let id = "u";
      try { const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); id = String(p.id ?? p.userId ?? p.user_id ?? p.sub ?? "u"); } catch (e) { /* توكن غير JWT */ }
      if (authCache.size > 500) authCache.clear();
      authCache.set(token, { id, exp: Date.now() + 60000 });
      resolve(id);
    });
    r.on("error", () => resolve(null));
    r.end();
  });
}

async function handleX(req, res) {
  const url = new URL(req.url, "http://x"), p = url.pathname;
  const json = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : url.searchParams.get("t") || "";
  let m;
  try {
    if (req.method === "GET" && (m = p.match(/^\/x\/avatar\/([\w-]+)$/))) {        // الصور الشخصية عامة
      for (const ext of Object.values(AV_EXT)) {
        const f = path.join(DATA_DIR, "avatars", m[1] + "." + ext);
        if (fs.existsSync(f)) {
          res.writeHead(200, { "content-type": FILE_MIME[ext], "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" });
          return fs.createReadStream(f).pipe(res);
        }
      }
      res.writeHead(404); return res.end();
    }
    if (req.method === "GET" && (m = p.match(/^\/x\/f\/([a-f0-9]{24}\.?\w{0,8})$/))) {   // المرفقات تحتاج جلسة
      if (!(await checkToken(token))) return json(401, { error: "unauthorized" });
      const f = path.join(DATA_DIR, "files", m[1]);
      fs.stat(f, (err, st) => {
        if (err) { res.writeHead(404); return res.end(); }
        const type = FILE_MIME[m[1].split(".")[1]] || "application/octet-stream";
        const h = { "content-type": type, "accept-ranges": "bytes", "x-content-type-options": "nosniff", "content-security-policy": "sandbox",
          "cache-control": "private, max-age=3600" };
        if (!INLINE.test(type)) h["content-disposition"] = "attachment";
        let range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ""), start = 0, end = st.size - 1, code = 200;
        if (range && (range[1] || range[2])) {
          start = range[1] ? +range[1] : st.size - +range[2];
          end = range[1] && range[2] ? Math.min(+range[2], end) : end;
          if (start > end || start >= st.size) { res.writeHead(416, { "content-range": "bytes */" + st.size }); return res.end(); }
          code = 206; h["content-range"] = `bytes ${start}-${end}/${st.size}`;
        }
        h["content-length"] = end - start + 1;
        res.writeHead(code, h);
        fs.createReadStream(f, { start, end }).pipe(res);
      });
      return;
    }
    if (req.method === "POST" && (p === "/x/avatar" || p === "/x/upload")) {
      const id = await checkToken(token);
      if (!id) { req.resume(); return json(401, { error: "unauthorized" }); }
      const isAvatar = p === "/x/avatar", limit = isAvatar ? MAX_AVATAR : MAX_FILE;
      const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
      if (isAvatar && !AV_EXT[type]) { req.resume(); return json(415, { error: "صيغة الصورة غير مدعومة (PNG / JPG / WEBP / GIF)" }); }
      if (Number(req.headers["content-length"]) > limit) { req.resume(); return json(413, { error: "الحد الأقصى للحجم " + limit / 1048576 + " ميغابايت" }); }
      let name, ext;
      if (isAvatar) {
        ext = AV_EXT[type]; name = id.replace(/[^\w-]/g, "") + "." + ext;
        for (const e of Object.values(AV_EXT)) if (e !== ext) fs.unlink(path.join(DATA_DIR, "avatars", id.replace(/[^\w-]/g, "") + "." + e), () => {});
      } else {
        let orig = ""; try { orig = decodeURIComponent(req.headers["x-file-name"] || ""); } catch (e) { /* تجاهل */ }
        ext = (orig.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
        if (!ext || ext === orig.toLowerCase()) ext = type.split("/")[1] ? type.split("/")[1].replace(/[^a-z0-9]/g, "").slice(0, 8) : "bin";
        name = require("crypto").randomBytes(12).toString("hex") + "." + ext;
      }
      const dest = path.join(DATA_DIR, isAvatar ? "avatars" : "files", name), out = fs.createWriteStream(dest);
      let size = 0, dead = false;
      req.on("data", (c) => {
        size += c.length;
        if (size > limit && !dead) { dead = true; req.unpipe(out); out.destroy(); fs.unlink(dest, () => {}); json(413, { error: "الحد الأقصى للحجم " + limit / 1048576 + " ميغابايت" }); req.resume(); }
      });
      req.pipe(out);
      out.on("finish", () => { if (!dead) json(200, { url: isAvatar ? "/x/avatar/" + name.split(".")[0] : "/x/f/" + name, size }); });
      out.on("error", () => { if (!dead) json(500, { error: "تعذّر حفظ الملف" }); });
      return;
    }
    res.writeHead(404); res.end();
  } catch (e) { if (!res.headersSent) json(500, { error: "server_error" }); }
}

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
  const noCache = [".html", ".js", ".mjs", ".css", ".json"].includes(ext);   // الواجهة تُعاد مراجعتها دائماً ليظهر كل تحديث
  const extra = {};
  // مرة واحدة لكل متصفح: امسح الكاش القديم (كان JS/CSS يُخزَّن ساعة)
  if (ext === ".html" && !/(^|;\s*)bv=3/.test(req.headers.cookie || "")) {
    extra["Clear-Site-Data"] = '"cache"';
    extra["Set-Cookie"] = "bv=3; Path=/; Max-Age=31536000; SameSite=Lax; Secure";
  }
  res.writeHead(200, Object.assign({
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": data.length,
    "Cache-Control": noCache ? "no-cache" : "public, max-age=3600"
  }, SECURITY_HEADERS, extra));
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
