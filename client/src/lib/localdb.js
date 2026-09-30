import Dexie from 'dexie';

export const db = new Dexie('osp');
db.version(1).stores({
  messages: '++localId, id, clientId, createdAt, from, to, [from+to]',
  outbox: '++id, clientId, createdAt',
  statuses: 'id, createdAt, user',
});

let clientIdSeq = 0;
export function newClientId() {
  clientIdSeq += 1;
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${clientIdSeq}`;
}

export async function saveMessage(msg) {
  // Merge by clientId if present (server ack), else by id
  const existingByClient = msg.clientId
    ? await db.messages.where('clientId').equals(msg.clientId).first()
    : null;
  const existingById = msg.id
    ? await db.messages.where('id').equals(msg.id).first()
    : null;

  const existing = existingByClient || existingById;
  if (existing) {
    await db.messages.update(existing.localId, { ...existing, ...msg });
    return existing.localId;
  }
  return db.messages.add(msg);
}

export async function getMessages() {
  return db.messages.orderBy('createdAt').toArray();
}

export async function lastServerId() {
  const rows = await db.messages.filter((m) => !!m.id).toArray();
  return rows.reduce((max, r) => Math.max(max, r.id || 0), 0);
}

export async function enqueue(msg) {
  await db.outbox.add({ ...msg, createdAt: Date.now() });
}

export async function drainOutbox(sendFn) {
  const items = await db.outbox.orderBy('createdAt').toArray();
  for (const it of items) {
    try {
      await sendFn(it);
      await db.outbox.delete(it.id);
    } catch (e) {
      console.warn('drainOutbox failed for', it, e);
      break; // stop and retry later
    }
  }
}

export async function markConsumed(id) {
  const row = await db.messages.where('id').equals(id).first();
  if (row) await db.messages.update(row.localId, { consumed: true });
}

export async function markReadUpTo(upToId, readAt) {
  const rows = await db.messages.toArray();
  for (const r of rows) {
    if (r.id && r.id <= upToId && !r.readAt) {
      await db.messages.update(r.localId, { readAt });
    }
  }
}
