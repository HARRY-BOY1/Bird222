const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_PREFIXES = ['image/', 'video/', 'audio/'];
const ALLOWED_EXACT = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'text/plain',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

function isAllowed(mime) {
  return ALLOWED_PREFIXES.some((prefix) => String(mime).startsWith(prefix)) || ALLOWED_EXACT.has(mime);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 12).replace(/[^.\w]/g, '').toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowed(file.mimetype)) {
      const error = new Error('نوع الملف غير مدعوم. المسموح: صور، فيديو، صوت، PDF، ZIP، نصوص، Office.');
      error.status = 415;
      return cb(error);
    }
    return cb(null, true);
  },
});

function safeName(original) {
  const base = String(original || 'file').replace(/[\\/]/g, '_').replace(/[\u0000-\u001f]/g, '').trim();
  return (base || 'file').slice(0, 120);
}

module.exports = { upload, UPLOAD_DIR, MAX_BYTES, safeName, isAllowed };
