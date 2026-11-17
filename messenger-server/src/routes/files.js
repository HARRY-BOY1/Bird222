const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const { verifyToken } = require('../middleware/auth');
const { UPLOAD_DIR } = require('../uploads');

const router = express.Router();

// الملفات تُخدم برابط غير قابل للتخمين + توكن، لأن وسوم <img>/<video> لا ترسل هيدرات.
router.get('/:id', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    verifyToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(String(req.params.id));
  if (!row) return res.status(404).json({ error: 'File not found' });
  const filePath = path.join(UPLOAD_DIR, path.basename(row.stored_name));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

  const inline = /^(image|video|audio)\//.test(row.mime || '');
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`);
  return res.sendFile(filePath);
});

module.exports = router;
