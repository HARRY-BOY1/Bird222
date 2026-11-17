const express = require('express');
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const userIdSchema = z.coerce.number().int().positive();
const messageCursorSchema = z.coerce.number().int().positive();

router.use(requireAuth);

const publicUser = (user) => ({
  id: user.id, username: user.username,
  display_name: user.display_name || null, bio: user.bio || null,
  created_at: user.created_at, last_seen: user.last_seen,
});

function visibleMessage(message, viewerId) {
  if (!message) return null;
  return {
    ...message,
    deleted_for_all: undefined,
    reply: message.reply_to ? (() => {
      const original = db.prepare('SELECT id, sender_id, text FROM messages WHERE id = ?').get(message.reply_to);
      return original ? { id: original.id, sender_id: original.sender_id, text: original.text } : null;
    })() : null,
  };
}

router.get('/users/search', (req, res) => {
  const query = z.string().trim().min(1).max(32).safeParse(req.query.q);
  if (!query.success) return res.status(400).json({ error: 'q must be between 1 and 32 characters' });
  const raw = query.data.replace(/^@/, '').replace(/[!%_]/g, '!$&');
  const users = db.prepare(`
    SELECT id, username, display_name, bio, created_at, last_seen FROM users
    WHERE (username LIKE ? ESCAPE '!' OR display_name LIKE ? ESCAPE '!') AND id != ?
    ORDER BY username COLLATE NOCASE LIMIT 25
  `).all(`%${raw}%`, `%${raw}%`, req.user.id).map(publicUser);
  return res.json({ users });
});

router.get('/users/:id', (req, res) => {
  const parsed = userIdSchema.safeParse(req.params.id);
  if (!parsed.success || !Number.isSafeInteger(parsed.data)) return res.status(400).json({ error: 'Invalid user id' });
  const user = db.prepare('SELECT id, username, display_name, bio, created_at, last_seen FROM users WHERE id = ?').get(parsed.data);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: publicUser(user) });
});

router.patch('/profile', (req, res) => {
  const schema = z.object({
    username: z.string().trim().min(5).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers and underscores').optional(),
    display_name: z.string().trim().min(1).max(64).nullable().optional(),
    bio: z.string().trim().max(200).nullable().optional(),
  }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile', details: parsed.error.flatten().fieldErrors });
  const data = parsed.data;
  if (!data.username && data.display_name === undefined && data.bio === undefined) return res.status(400).json({ error: 'No changes provided' });
  try {
    const fields = [];
    const values = [];
    for (const key of ['username', 'display_name', 'bio']) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
    }
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    const user = db.prepare('SELECT id, username, display_name, bio, created_at, last_seen FROM users WHERE id = ?').get(req.user.id);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Username is already taken' });
    throw error;
  }
});

router.post('/contacts', (req, res) => {
  const parsed = z.object({ contactId: userIdSchema }).strict().safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(parsed.data.contactId)) return res.status(400).json({ error: 'contactId must be a positive safe integer' });
  if (parsed.data.contactId === req.user.id) return res.status(400).json({ error: 'You cannot add yourself as a contact' });
  const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(parsed.data.contactId);
  if (!exists) return res.status(404).json({ error: 'User not found' });
  db.prepare('INSERT OR IGNORE INTO contacts (user_id, contact_id) VALUES (?, ?)').run(req.user.id, parsed.data.contactId);
  const contact = db.prepare('SELECT id, username, display_name, bio, created_at, last_seen FROM users WHERE id = ?').get(parsed.data.contactId);
  return res.status(201).json({ contact: publicUser(contact) });
});

router.get('/contacts', (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.bio, u.created_at, u.last_seen,
      p.pinned, p.muted, p.archived
    FROM contacts c JOIN users u ON u.id = c.contact_id
    LEFT JOIN chat_prefs p ON p.user_id = c.user_id AND p.peer_id = c.contact_id
    WHERE c.user_id = ? ORDER BY p.pinned DESC, u.username COLLATE NOCASE
  `).all(req.user.id);
  const prefs = Object.fromEntries(rows.map((row) => [row.id, { pinned: Boolean(row.pinned), muted: Boolean(row.muted), archived: Boolean(row.archived) }]));
  return res.json({ contacts: rows.map(publicUser), prefs });
});

router.get('/prefs', (req, res) => {
  const rows = db.prepare('SELECT peer_id, pinned, muted, archived FROM chat_prefs WHERE user_id = ?').all(req.user.id);
  return res.json({ prefs: Object.fromEntries(rows.map((r) => [r.peer_id, { pinned: Boolean(r.pinned), muted: Boolean(r.muted), archived: Boolean(r.archived) }])) });
});

router.post('/prefs', (req, res) => {
  const schema = z.object({
    peerId: userIdSchema,
    pinned: z.boolean().optional(), muted: z.boolean().optional(), archived: z.boolean().optional(),
  }).strict();
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(parsed.data.peerId)) return res.status(400).json({ error: 'Invalid preferences' });
  const { peerId, ...changes } = parsed.data;
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'No changes provided' });
  const existing = db.prepare('SELECT pinned, muted, archived FROM chat_prefs WHERE user_id = ? AND peer_id = ?').get(req.user.id, peerId) || { pinned: 0, muted: 0, archived: 0 };
  const next = {
    pinned: changes.pinned === undefined ? existing.pinned : (changes.pinned ? 1 : 0),
    muted: changes.muted === undefined ? existing.muted : (changes.muted ? 1 : 0),
    archived: changes.archived === undefined ? existing.archived : (changes.archived ? 1 : 0),
  };
  db.prepare(`
    INSERT INTO chat_prefs (user_id, peer_id, pinned, muted, archived) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET pinned = excluded.pinned, muted = excluded.muted, archived = excluded.archived
  `).run(req.user.id, peerId, next.pinned, next.muted, next.archived);
  return res.json({ ok: true });
});

router.get('/drafts', (req, res) => {
  const rows = db.prepare('SELECT peer_id, text FROM drafts WHERE user_id = ? AND text != \'\'').all(req.user.id);
  return res.json({ drafts: Object.fromEntries(rows.map((r) => [r.peer_id, r.text])) });
});

router.put('/drafts', (req, res) => {
  const parsed = z.object({ peerId: userIdSchema, text: z.string().max(4000) }).strict().safeParse(req.body);
  if (!parsed.success || !Number.isSafeInteger(parsed.data.peerId)) return res.status(400).json({ error: 'Invalid draft' });
  db.prepare(`INSERT INTO drafts (user_id, peer_id, text) VALUES (?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET text = excluded.text`).run(req.user.id, parsed.data.peerId, parsed.data.text);
  return res.json({ ok: true });
});

router.get('/saved-messages', (req, res) => {
  const messages = db.prepare(`
    SELECT id, sender_id, receiver_id, text, status, created_at, edited_at, reply_to, reaction FROM messages
    WHERE sender_id = ? AND receiver_id = ? AND deleted_for_all = 0
      AND id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)
    ORDER BY id DESC LIMIT 50
  `).all(req.user.id, req.user.id, req.user.id).reverse().map((m) => visibleMessage(m, req.user.id));
  return res.json({ messages, hasMore: false, nextBefore: null });
});

router.get('/messages/:userId', (req, res) => {
  const userId = userIdSchema.safeParse(req.params.userId);
  if (!userId.success || !Number.isSafeInteger(userId.data)) return res.status(400).json({ error: 'userId must be a positive safe integer' });
  if (userId.data === req.user.id) return res.status(400).json({ error: 'Cannot open a chat with yourself' });
  const before = req.query.before === undefined ? undefined : messageCursorSchema.safeParse(req.query.before);
  if (before && (!before.success || !Number.isSafeInteger(before.data))) return res.status(400).json({ error: 'before must be a positive safe integer message id' });

  const messages = db.prepare(`
    SELECT id, sender_id, receiver_id, text, status, created_at, edited_at, reply_to, reaction FROM messages
    WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      AND deleted_for_all = 0
      AND id NOT IN (SELECT message_id FROM message_deletions WHERE user_id = ?)
      AND id < COALESCE(?, 9223372036854775807)
    ORDER BY id DESC LIMIT 51
  `).all(req.user.id, userId.data, userId.data, req.user.id, req.user.id, before?.data ?? null);
  const hasMore = messages.length > 50;
  if (hasMore) messages.pop();
  return res.json({ messages: messages.reverse().map((m) => visibleMessage(m, req.user.id)), hasMore, nextBefore: hasMore ? messages[0]?.id : null });
});

function editableMessage(req, res) {
  const id = userIdSchema.safeParse(req.params.id);
  if (!id.success || !Number.isSafeInteger(id.data)) return { error: res.status(400).json({ error: 'Invalid message id' }) };
  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(id.data);
  if (!message || message.sender_id !== req.user.id) return { error: res.status(404).json({ error: 'Message not found' }) };
  return { message };
}

router.post('/messages/:id/edit', (req, res) => {
  const parsed = z.object({ text: z.string().trim().min(1).max(4000) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid text' });
  const { message, error } = editableMessage(req, res);
  if (error) return;
  db.prepare("UPDATE messages SET text = ?, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(parsed.data.text, message.id);
  const updated = db.prepare('SELECT id, sender_id, receiver_id, text, status, created_at, edited_at, reply_to, reaction FROM messages WHERE id = ?').get(message.id);
  res.json({ message: visibleMessage(updated, req.user.id) });
});

router.post('/messages/:id/react', (req, res) => {
  const parsed = z.object({ reaction: z.string().trim().min(1).max(16).nullable() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid reaction' });
  const id = userIdSchema.safeParse(req.params.id);
  if (!id.success || !Number.isSafeInteger(id.data)) return res.status(400).json({ error: 'Invalid message id' });
  const message = db.prepare('SELECT id FROM messages WHERE id = ?').get(id.data);
  if (!message) return res.status(404).json({ error: 'Message not found' });
  db.prepare('UPDATE messages SET reaction = ? WHERE id = ?').run(parsed.data.reaction, id.data);
  return res.json({ messageId: id.data, reaction: parsed.data.reaction });
});

router.post('/messages/:id/delete', (req, res) => {
  const parsed = z.object({ mode: z.enum(['me', 'everyone']) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid delete mode' });
  const { message, error } = editableMessage(req, res);
  if (error) return;
  if (parsed.data.mode === 'everyone') db.prepare('UPDATE messages SET deleted_for_all = 1, text = \'\' WHERE id = ?').run(message.id);
  else db.prepare('INSERT OR IGNORE INTO message_deletions (message_id, user_id) VALUES (?, ?)').run(message.id, req.user.id);
  return res.json({ ok: true, messageId: message.id, mode: parsed.data.mode, senderId: message.sender_id, receiverId: message.receiver_id });
});

module.exports = router;
