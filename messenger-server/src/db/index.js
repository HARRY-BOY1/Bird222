const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const filename = process.env.DB_PATH || './data/app.db';
const databasePath = filename === ':memory:' ? filename : path.resolve(process.cwd(), filename);
if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen TEXT
  );
  CREATE TABLE IF NOT EXISTS contacts (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (user_id, contact_id),
    CHECK (user_id != contact_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS messages_chat_cursor ON messages(sender_id, receiver_id, id DESC);
  CREATE INDEX IF NOT EXISTS messages_receiver_status ON messages(receiver_id, status, id);
  CREATE INDEX IF NOT EXISTS users_username_search ON users(username COLLATE NOCASE);
`);

// Idempotent migrations — existing accounts and messages are never modified or dropped.
function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('users', 'display_name', 'TEXT');
addColumn('users', 'bio', 'TEXT');
addColumn('messages', 'edited_at', 'TEXT');
addColumn('messages', 'reply_to', 'INTEGER');
addColumn('messages', 'reaction', 'TEXT');
addColumn('messages', 'deleted_for_all', 'INTEGER NOT NULL DEFAULT 0');
addColumn('messages', 'kind', "TEXT NOT NULL DEFAULT 'text'");
addColumn('messages', 'attachment_id', 'TEXT');
addColumn('messages', 'attachment_name', 'TEXT');
addColumn('messages', 'attachment_size', 'INTEGER');
addColumn('messages', 'attachment_mime', 'TEXT');
addColumn('messages', 'sticker', 'TEXT');

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS message_deletions (
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS chat_prefs (
    user_id INTEGER NOT NULL,
    peer_id INTEGER NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    muted INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, peer_id)
  );
  CREATE TABLE IF NOT EXISTS drafts (
    user_id INTEGER NOT NULL,
    peer_id INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, peer_id)
  );
`);

module.exports = db;
