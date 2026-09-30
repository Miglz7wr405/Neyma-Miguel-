import { Server } from 'socket.io';
import { verifyToken } from './auth.js';
import { partnerOf } from './users.js';
import db from './db.js';

// Map<userId, Set<socketId>>
const online = new Map();

function add(uid, sid) {
  if (!online.has(uid)) online.set(uid, new Set());
  online.get(uid).add(sid);
}
function remove(uid, sid) {
  const s = online.get(uid);
  if (!s) return;
  s.delete(sid);
  if (s.size === 0) online.delete(uid);
}
function isOnline(uid) {
  return online.has(uid);
}

export function setupSocket(server) {
  const io = new Server(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const user = token && verifyToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const me = socket.data.user;
    add(me.id, socket.id);
    socket.join(`u:${me.id}`);
    io.to(`u:${partnerOf(me.id).id}`).emit('presence', { user: me.id, online: true });
    socket.emit('presence', { user: partnerOf(me.id).id, online: isOnline(partnerOf(me.id).id) });

    // Client sends a new message
    socket.on('message:send', (payload, ack) => {
      const partner = partnerOf(me.id);
      const now = Date.now();
      const info = db
        .prepare(
          `INSERT INTO messages (client_id, from_user, to_user, kind, body, media_path, view_once, delivered_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          payload.clientId || null,
          me.id,
          partner.id,
          payload.kind,
          payload.body || null,
          payload.mediaPath || null,
          payload.viewOnce ? 1 : 0,
          isOnline(partner.id) ? now : null,
          now,
        );
      const msg = {
        id: info.lastInsertRowid,
        clientId: payload.clientId || null,
        from: me.id,
        to: partner.id,
        kind: payload.kind,
        body: payload.body || null,
        mediaPath: payload.mediaPath || null,
        viewOnce: !!payload.viewOnce,
        consumed: false,
        deliveredAt: isOnline(partner.id) ? now : null,
        readAt: null,
        createdAt: now,
      };
      ack?.({ ok: true, message: msg });
      io.to(`u:${partner.id}`).emit('message:new', msg);
      // Echo back to other sessions of self
      socket.to(`u:${me.id}`).emit('message:new', msg);
    });

    // Client marks partner's messages as read
    socket.on('message:read', ({ upToId }) => {
      const partner = partnerOf(me.id);
      const now = Date.now();
      db.prepare(
        `UPDATE messages SET read_at = ? WHERE to_user = ? AND from_user = ? AND read_at IS NULL AND id <= ?`,
      ).run(now, me.id, partner.id, upToId);
      io.to(`u:${partner.id}`).emit('message:read', { upToId, readAt: now, by: me.id });
    });

    socket.on('typing', ({ typing }) => {
      const partner = partnerOf(me.id);
      io.to(`u:${partner.id}`).emit('typing', { user: me.id, typing: !!typing });
    });

    socket.on('status:new', (payload) => {
      const now = Date.now();
      const info = db
        .prepare(
          `INSERT INTO statuses (user, kind, body, media_path, created_at) VALUES (?,?,?,?,?)`,
        )
        .run(me.id, payload.kind, payload.body || null, payload.mediaPath || null, now);
      const s = {
        id: info.lastInsertRowid,
        user: me.id,
        kind: payload.kind,
        body: payload.body || null,
        mediaPath: payload.mediaPath || null,
        createdAt: now,
      };
      const partner = partnerOf(me.id);
      io.to(`u:${partner.id}`).emit('status:new', s);
      socket.emit('status:new', s);
    });

    socket.on('disconnect', () => {
      remove(me.id, socket.id);
      if (!isOnline(me.id)) {
        io.to(`u:${partnerOf(me.id).id}`).emit('presence', { user: me.id, online: false });
      }
    });
  });

  return io;
}

export function isUserOnline(uid) {
  return online.has(uid);
}
