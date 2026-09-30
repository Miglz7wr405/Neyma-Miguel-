import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import db, { uploadsDir } from './db.js';
import { login, authMiddleware, verifyToken } from './auth.js';
import { upload, deleteFileSafe } from './uploads.js';
import { setupSocket } from './socket.js';
import { partnerOf, USERS } from './users.js';

let io = null;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/login', (req, res) => {
  const { phone, password } = req.body || {};
  const result = login(phone, password);
  if (!result) return res.status(401).json({ error: 'bad_credentials' });
  const partner = partnerOf(result.user.id);
  res.json({
    ...result,
    partner: { id: partner.id, name: partner.name, phone: partner.phone },
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const partner = partnerOf(req.user.id);
  const prof = db.prepare('SELECT * FROM profiles WHERE user = ?').get(req.user.id);
  const partnerProf = db.prepare('SELECT * FROM profiles WHERE user = ?').get(partner.id);
  res.json({
    user: { id: req.user.id, name: req.user.name, phone: req.user.phone, profile: prof || null },
    partner: {
      id: partner.id,
      name: partner.name,
      phone: partner.phone,
      profile: partnerProf || null,
    },
  });
});

app.put('/api/profile', authMiddleware, (req, res) => {
  const { displayName } = req.body || {};
  db.prepare(
    `INSERT INTO profiles (user, display_name, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`,
  ).run(req.user.id, displayName || null, Date.now());
  res.json({ ok: true });
});

app.post('/api/profile/avatar', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  const prev = db.prepare('SELECT avatar_path FROM profiles WHERE user = ?').get(req.user.id);
  if (prev?.avatar_path) deleteFileSafe(prev.avatar_path);
  db.prepare(
    `INSERT INTO profiles (user, avatar_path, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user) DO UPDATE SET avatar_path = excluded.avatar_path, updated_at = excluded.updated_at`,
  ).run(req.user.id, req.file.path, Date.now());
  res.json({ ok: true, url: `/api/media/${path.basename(req.file.path)}` });
});

// Sync: return messages since a given id
app.get('/api/messages', authMiddleware, (req, res) => {
  const since = Number(req.query.since || 0);
  const partner = partnerOf(req.user.id);
  const rows = db
    .prepare(
      `SELECT * FROM messages
       WHERE ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))
         AND id > ?
       ORDER BY id ASC`,
    )
    .all(req.user.id, partner.id, partner.id, req.user.id, since);
  res.json(
    rows.map((r) => ({
      id: r.id,
      clientId: r.client_id,
      from: r.from_user,
      to: r.to_user,
      kind: r.kind,
      body: r.body,
      mediaPath: r.media_path
        ? `/api/media/${path.basename(r.media_path)}${r.view_once ? '?vo=1' : ''}`
        : null,
      viewOnce: !!r.view_once,
      consumed: !!r.consumed,
      deliveredAt: r.delivered_at,
      readAt: r.read_at,
      createdAt: r.created_at,
    })),
  );
});

// Upload a media file for a message (returns path/id to attach on message:send)
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });
  res.json({
    mediaPath: req.file.path, // stored in DB
    url: `/api/media/${path.basename(req.file.path)}`,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Serve media. Accepts token via Authorization header or ?token= query
// (needed for <img>/<audio> src). If view_once, delete after streaming to
// the recipient and notify both sides.
app.get('/api/media/:name', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const q = req.query.token;
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : q;
  const user = token && verifyToken(token);
  if (!user) return res.status(401).end();

  const filename = path.basename(req.params.name);
  const filepath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filepath)) return res.status(410).json({ error: 'gone' });

  const row = db
    .prepare('SELECT * FROM messages WHERE media_path = ? ORDER BY id DESC LIMIT 1')
    .get(filepath);

  if (row && row.view_once) {
    if (row.consumed) return res.status(410).json({ error: 'view_once_consumed' });
    // Sender re-viewing before consumption: allow without consuming
    if (row.to_user !== user.id) {
      return res.sendFile(filepath);
    }
    res.sendFile(filepath, (err) => {
      if (!err) {
        db.prepare('UPDATE messages SET consumed = 1 WHERE id = ?').run(row.id);
        deleteFileSafe(filepath);
        try {
          io?.to(`u:${row.from_user}`).emit('message:consumed', { id: row.id });
          io?.to(`u:${row.to_user}`).emit('message:consumed', { id: row.id });
        } catch {}
      }
    });
    return;
  }

  res.sendFile(filepath);
});

// Statuses
app.get('/api/statuses', authMiddleware, (_req, res) => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rows = db
    .prepare('SELECT * FROM statuses WHERE created_at > ? ORDER BY created_at DESC')
    .all(cutoff);
  res.json(
    rows.map((r) => ({
      id: r.id,
      user: r.user,
      kind: r.kind,
      body: r.body,
      mediaPath: r.media_path ? `/api/media/${path.basename(r.media_path)}` : null,
      createdAt: r.created_at,
    })),
  );
});

app.post('/api/statuses/:id/view', authMiddleware, (req, res) => {
  db.prepare(
    `INSERT OR IGNORE INTO status_views (status_id, user, viewed_at) VALUES (?,?,?)`,
  ).run(Number(req.params.id), req.user.id, Date.now());
  res.json({ ok: true });
});

// Serve built client in production
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
io = setupSocket(server);

const PORT = Number(process.env.PORT || 3001);
server.listen(PORT, () => {
  console.log(`[osp] server listening on :${PORT}`);
  console.log(`[osp] users:`);
  for (const u of USERS) console.log(`  - ${u.name} (phone ${u.phone})`);
});
