// Transport over a public MQTT-over-WebSocket broker. No account, no server.
// Everything is end-to-end encrypted; large payloads (media) are chunked.

import mqtt from 'mqtt';
import { BROKERS, TOPICS, CHUNK_SIZE, ROOM_ID } from './config.js';
import { encryptJSON, decryptJSON } from './crypto.js';

const PRESENCE_BASE = `osp/${ROOM_ID}/presence/`;

export function createBus(user) {
  const listeners = {};
  const emit = (ev, data) => (listeners[ev] || []).forEach((f) => f(data));
  const on = (ev, fn) => {
    (listeners[ev] ||= []).push(fn);
    return () => off(ev, fn);
  };
  const off = (ev, fn) => {
    listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn);
  };

  const reassembly = new Map(); // id -> { parts: [], got: n, total }
  let client = null;
  let brokerIdx = 0;
  let connected = false;
  let connectTimer = null;
  let reconnTimer = null;
  let stopped = false;

  function scheduleReconnect() {
    if (stopped) return;
    clearTimeout(reconnTimer);
    reconnTimer = setTimeout(() => { brokerIdx = 0; connect(); }, 2500);
  }

  function advance() {
    brokerIdx += 1;
    if (brokerIdx < BROKERS.length) connect();
    else scheduleReconnect(); // all brokers failed; retry from the top shortly
  }

  async function connect() {
    if (stopped) return;
    const url = BROKERS[brokerIdx];
    const willPayload = await encryptJSON({ user: user.id, online: false });
    let settled = false;

    client = mqtt.connect(url, {
      clientId: `osp-${user.id}-${Math.random().toString(16).slice(2, 10)}`,
      clean: true,
      reconnectPeriod: 0, // we manage reconnection + broker rotation ourselves
      connectTimeout: 8000,
      keepalive: 30,
      will: { topic: TOPICS.presence(user.id), payload: willPayload, qos: 0, retain: true },
    });

    connectTimer = setTimeout(() => {
      if (!settled) { settled = true; try { client.end(true); } catch {} advance(); }
    }, 9000);

    client.on('connect', async () => {
      settled = true;
      clearTimeout(connectTimer);
      connected = true;
      client.subscribe([TOPICS.msg, TOPICS.ctrl, TOPICS.status, TOPICS.presenceWild], { qos: 0 });
      const p = await encryptJSON({ user: user.id, online: true });
      client.publish(TOPICS.presence(user.id), p, { qos: 0, retain: true });
      emit('connect');
    });

    client.on('message', (topic, buf) => onWire(topic, buf.toString()));

    client.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(connectTimer);
        try { client.end(true); } catch {}
        advance();
      }
    });

    client.on('close', () => {
      clearTimeout(connectTimer);
      if (connected) {
        connected = false;
        emit('disconnect');
        scheduleReconnect();
      }
    });
  }

  async function onWire(topic, str) {
    if (topic.startsWith(PRESENCE_BASE)) {
      const obj = await decryptJSON(str);
      if (obj && obj.user !== user.id) emit('presence', obj);
      return;
    }
    if (topic === TOPICS.ctrl) {
      const obj = await decryptJSON(str);
      if (obj && obj.from !== user.id) emit('ctrl', obj);
      return;
    }
    // msg / status use a chunk envelope
    let env;
    try { env = JSON.parse(str); } catch { return; }
    let full = null;
    if (env.k === 'whole') {
      full = env.s;
    } else if (env.k === 'chunk') {
      let r = reassembly.get(env.id);
      if (!r) { r = { parts: new Array(env.n).fill(null), got: 0, n: env.n }; reassembly.set(env.id, r); }
      if (r.parts[env.i] == null) { r.parts[env.i] = env.s; r.got += 1; }
      if (r.got === r.n) {
        full = r.parts.join('');
        reassembly.delete(env.id);
      }
    }
    if (full == null) return;
    const obj = await decryptJSON(full);
    if (!obj) return;
    if (topic === TOPICS.msg) {
      if (obj.from !== user.id) emit('message', obj);
    } else if (topic === TOPICS.status) {
      if (obj.user !== user.id) emit('status', obj);
    }
  }

  async function publishEnc(topic, obj) {
    if (!client || !connected) return false;
    const enc = await encryptJSON(obj);
    if (enc.length <= CHUNK_SIZE) {
      client.publish(topic, JSON.stringify({ k: 'whole', s: enc }), { qos: 0 });
    } else {
      const id = Math.random().toString(16).slice(2);
      const n = Math.ceil(enc.length / CHUNK_SIZE);
      for (let i = 0; i < n; i++) {
        const part = enc.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        client.publish(topic, JSON.stringify({ k: 'chunk', id, i, n, s: part }), { qos: 0 });
      }
    }
    return true;
  }

  return {
    on,
    off,
    connect,
    isConnected: () => connected,
    publishMessage: (msg) => publishEnc(TOPICS.msg, msg),
    publishStatus: (s) => publishEnc(TOPICS.status, s),
    publishCtrl: async (obj) => {
      if (!client || !connected) return false;
      client.publish(TOPICS.ctrl, await encryptJSON({ from: user.id, ...obj }), { qos: 0 });
      return true;
    },
    destroy: () => {
      stopped = true;
      clearTimeout(connectTimer);
      clearTimeout(reconnTimer);
      try { client?.end(true); } catch {}
    },
  };
}
