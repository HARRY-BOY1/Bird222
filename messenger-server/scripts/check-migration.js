process.env.DB_PATH = './data/messenger.sqlite';
const db = require('../src/db');
const cols = db.prepare('PRAGMA table_info(messages)').all().map((x) => x.name);
console.log('new columns:', cols.filter((x) => ['edited_at', 'reply_to', 'reaction', 'deleted_for_all'].includes(x)).join(', '));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('chat_prefs','drafts','message_deletions')").all().map((x) => x.name);
console.log('new tables:', tables.join(', '));
console.log('users preserved:', db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
console.log('messages preserved:', db.prepare('SELECT COUNT(*) AS n FROM messages').get().n);
db.close();
