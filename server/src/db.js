import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('server/data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

export const dataDir = DATA_DIR;
export const uploadsDir = path.join(DATA_DIR, 'uploads');

const db = new Database(path.join(DATA_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    kind TEXT NOT NULL,           -- 'text' | 'audio' | 'photo'
    body TEXT,                    -- for text: the text; for media: file id
    media_path TEXT,              -- absolute path in uploads
    view_once INTEGER DEFAULT 0,
    consumed INTEGER DEFAULT 0,
    delivered_at INTEGER,
    read_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user, id);
  CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_user, id);

  CREATE TABLE IF NOT EXISTS statuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    kind TEXT NOT NULL,           -- 'text' | 'photo'
    body TEXT,
    media_path TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS status_views (
    status_id INTEGER NOT NULL,
    user TEXT NOT NULL,
    viewed_at INTEGER NOT NULL,
    PRIMARY KEY (status_id, user)
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user TEXT PRIMARY KEY,
    display_name TEXT,
    avatar_path TEXT,
    updated_at INTEGER
  );
`);

export default db;

// Purge statuses older than 24h; also delete their files.
export function purgeExpiredStatuses() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db.prepare('SELECT id, media_path FROM statuses WHERE created_at < ?').all(cutoff);
  const delOne = db.prepare('DELETE FROM statuses WHERE id = ?');
  const delViews = db.prepare('DELETE FROM status_views WHERE status_id = ?');
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      if (r.media_path && fs.existsSync(r.media_path)) {
        try { fs.unlinkSync(r.media_path); } catch {}
      }
      delOne.run(r.id);
      delViews.run(r.id);
    }
  });
  tx(rows);
  return rows.length;
}

// Runs every 10 minutes.
setInterval(() => {
  try { purgeExpiredStatuses(); } catch (e) { console.error('purge error', e); }
}, 10 * 60 * 1000);
