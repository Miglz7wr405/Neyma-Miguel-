// Peer history reconciliation (no server). On connect each side announces
// which messages it already has; the other re-sends anything missing.
// Duplicates are harmless — saveMessage() merges by clientId.

const WINDOW_MS = 1000 * 60 * 60 * 24 * 30; // reconcile the last 30 days

export function buildSyncRequest(messages) {
  const since = Date.now() - WINDOW_MS;
  const have = messages
    .filter((m) => m.createdAt >= since && (m.clientId || m.id))
    .map((m) => m.clientId || `srv-${m.id}`);
  return { t: 'sync-req', since, have };
}

export function computeMissing(messages, req) {
  const haveSet = new Set(req.have || []);
  const since = req.since || 0;
  return messages.filter((m) => {
    if (m.createdAt < since) return false;
    const key = m.clientId || `srv-${m.id}`;
    return !haveSet.has(key);
  });
}
