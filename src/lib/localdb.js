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

const DAY = 24 * 60 * 60 * 1000;
export async function saveStatus(s) {
  await db.statuses.put(s);
}
export async function getActiveStatuses() {
  const cut = Date.now() - DAY;
  const all = await db.statuses.toArray();
  return all.filter((s) => s.createdAt > cut).sort((a, b) => a.createdAt - b.createdAt);
}
export async function purgeOldStatuses() {
  const cut = Date.now() - DAY;
  const all = await db.statuses.toArray();
  for (const s of all) if (s.createdAt <= cut) await db.statuses.delete(s.id);
}

export async function markConsumedByClientId(clientId) {
  const row = await db.messages.where('clientId').equals(clientId).first();
  if (row) await db.messages.update(row.localId, { consumed: true, mediaData: null });
}

export async function markDeliveredByClientId(clientId, at) {
  const row = await db.messages.where('clientId').equals(clientId).first();
  if (row && !row.deliveredAt) await db.messages.update(row.localId, { deliveredAt: at });
}

export async function markReadByClientIds(clientIds, at) {
  for (const cid of clientIds) {
    const row = await db.messages.where('clientId').equals(cid).first();
    if (row && !row.readAt) await db.messages.update(row.localId, { readAt: at, deliveredAt: row.deliveredAt || at });
  }
}

// Delete only on this device.
export async function deleteForMe(clientId) {
  const row = await db.messages.where('clientId').equals(clientId).first();
  if (row) await db.messages.delete(row.localId);
}

// Tombstone: replace content with "message deleted" (delete for everyone).
export async function markDeleted(clientId, at) {
  const row = await db.messages.where('clientId').equals(clientId).first();
  if (row) {
    await db.messages.update(row.localId, {
      kind: 'deleted',
      body: null,
      mediaData: null,
      viewOnce: false,
      replyTo: null,
      deletedAt: at || Date.now(),
    });
  }
}

export async function getMessageByClientId(clientId) {
  return db.messages.where('clientId').equals(clientId).first();
}
