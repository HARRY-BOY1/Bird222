const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');

const credentials = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Username can contain letters, numbers and underscores only'),
  password: z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes'),
}).strict();

function issueToken(user) {
  return jwt.sign({ username: user.username }, process.env.JWT_SECRET, {
    subject: String(user.id),
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

async function register(req, res, next) {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
  try {
    const { username, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
    const user = db.prepare('SELECT id, username, created_at, last_seen FROM users WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ user, token: issueToken(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return res.status(409).json({ error: 'Username is already taken' });
    next(error);
  }
}

async function login(req, res, next) {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
  try {
    const user = db.prepare('SELECT id, username, password_hash, created_at, last_seen FROM users WHERE username = ?').get(parsed.data.username);
    const valid = user && await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });
    const { password_hash: _, ...safeUser } = user;
    return res.json({ user: safeUser, token: issueToken(user) });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login };
