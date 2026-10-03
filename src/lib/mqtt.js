// Transport over public MQTT-over-WebSocket brokers. No account, no server.
// Connects to ALL brokers at once so the two peers always meet on at least one
// reachable broker (no split-brain "looks online but no messages"). Everything
// is end-to-end encrypted; large payloads (media) are chunked; duplicates that
// arrive via multiple brokers are de-duped by a per-message id.

import mqtt from 'mqtt';
import { BROKERS, TOPICS, CHUNK_SIZE, ROOM_ID } from './config.js';
import { encryptJSON, decryptJSON } from './crypto.js';

const PRESENCE_BASE = `osp/${ROOM_ID}/presence/`;

function newMid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createBus(user) {
  const listeners = {};
  const emit = (ev, data) => (listeners[ev] || []).forEach((f) => f(data));
  const on = (ev, fn) => { (listeners[ev] ||= []).push(fn); return () => off(ev, fn); };
  const off = (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); };

  const reassembly = new Map(); // id -> { parts, got, n }
  const seen = new Set();
  const seenOrder = [];
  function isDup(mid) {
    if (!mid) return false;
    if (seen.has(mid)) return true;
    seen.add(mid); seenOrder.push(mid);
    if (seenOrder.length > 800) seen.delete(seenOrder.shift());
    return false;
  }

  const clients = [];
  let connectedCount = 0;
  let started = false;
  let stopped = false;
  let willPayload = null;

  const anyUp = () => connectedCount > 0;
  const eachUp = (fn) => { for (const c of clients) { if (c && c.connected) { try { fn(c); } catch {} } } };

  function setupClient(url) {
    let isUp = false;
    const client = mqtt.connect(url, {
      clientId: `osp-${user.id}-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 8000,
      keepalive: 30,
      will: { topic: TOPICS.presence(user.id), payload: willPayload, qos: 0, retain: true },
    });

    const markDown = () => {
      if (isUp) { isUp = false; connectedCount -= 1; if (connectedCount === 0) emit('disconnect'); }
    };

    client.on('connect', async () => {
      client.subscribe([TOPICS.msg, TOPICS.ctrl, TOPICS.status, TOPICS.presenceWild], { qos: 0 });
      try {
        const p = await encryptJSON({ user: user.id, online: true });
        client.publish(TOPICS.presence(user.id), p, { qos: 0, retain: true });
      } catch {}
      if (!isUp) { isUp = true; connectedCount += 1; if (connectedCount === 1) emit('connect'); }
    });
    client.on('message', (topic, buf) => onWire(topic, buf.toString()));
    client.on('close', markDown);
    client.on('offline', markDown);
    client.on('error', () => {}); // built-in reconnect handles it
    return client;
  }

  async function connect() {
    if (started || stopped) return;
    started = true;
    willPayload = await encryptJSON({ user: user.id, online: false });
    for (const url of BROKERS) clients.push(setupClient(url));
  }

  async function onWire(topic, str) {
    if (topic.startsWith(PRESENCE_BASE)) {
      const obj = await decryptJSON(str);
      if (obj && obj.user !== user.id) emit('presence', obj);
      return;
    }
    if (topic === TOPICS.ctrl) {
      const obj = await decryptJSON(str);
      if (obj && obj.from !== user.id && !isDup(obj._mid)) emit('ctrl', obj);
      return;
    }
    let env;
    try { env = JSON.parse(str); } catch { return; }
    let full = null;
    if (env.k === 'whole') {
      full = env.s;
    } else if (env.k === 'chunk') {
      let r = reassembly.get(env.id);
      if (!r) { r = { parts: new Array(env.n).fill(null), got: 0, n: env.n }; reassembly.set(env.id, r); }
      if (r.parts[env.i] == null) { r.parts[env.i] = env.s; r.got += 1; }
      if (r.got === r.n) { full = r.parts.join(''); reassembly.delete(env.id); }
    }
    if (full == null) return;
    const obj = await decryptJSON(full);
    if (!obj) return;
    if (topic === TOPICS.msg) {
      if (obj.from !== user.id && !isDup(obj._mid)) emit('message', obj);
    } else if (topic === TOPICS.status) {
      if (obj.user !== user.id && !isDup(obj._mid)) emit('status', obj);
    }
  }

  async function publishEnc(topic, obj) {
    if (!anyUp()) return false;
    const enc = await encryptJSON({ ...obj, _mid: newMid() });
    if (enc.length <= CHUNK_SIZE) {
      const wire = JSON.stringify({ k: 'whole', s: enc });
      eachUp((c) => c.publish(topic, wire, { qos: 0 }));
    } else {
      const id = Math.random().toString(16).slice(2);
      const n = Math.ceil(enc.length / CHUNK_SIZE);
      for (let i = 0; i < n; i++) {
        const wire = JSON.stringify({ k: 'chunk', id, i, n, s: enc.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
        eachUp((c) => c.publish(topic, wire, { qos: 0 }));
      }
    }
    return true;
  }

  return {
    on,
    off,
    connect,
    isConnected: () => anyUp(),
    publishMessage: (msg) => publishEnc(TOPICS.msg, msg),
    publishStatus: (s) => publishEnc(TOPICS.status, s),
    publishCtrl: async (obj) => {
      if (!anyUp()) return false;
      const enc = await encryptJSON({ from: user.id, _mid: newMid(), ...obj });
      eachUp((c) => c.publish(TOPICS.ctrl, enc, { qos: 0 }));
      return true;
    },
    destroy: () => {
      stopped = true;
      for (const c of clients) { try { c.end(true); } catch {} }
      clients.length = 0;
    },
  };
}
