// App-wide constants. No server: everything lives here on the client.

export const APP_NAME = 'Our Sacred Place';

// The two (and only two) accounts.
export const USERS = [
  { id: 'miguel', name: 'Miguel', phone: '867272348', password: 'Neyma' },
  { id: 'neyma', name: 'Neyma', phone: '840532528', password: 'Miguel' },
];

export function findUser(phone, password) {
  return USERS.find(
    (u) => u.phone === String(phone).trim() && u.password === String(password),
  );
}
export function partnerOf(userId) {
  return USERS.find((u) => u.id !== userId);
}
export function userById(id) {
  return USERS.find((u) => u.id === id);
}

// Private namespace for this couple's channel. Long + random so nobody
// stumbles onto the topic on the shared public broker.
export const ROOM_ID = 'osp-9f3c7a1e-neyma-miguel-2b8d5c0a4e77';

// Shared secret used to derive the end-to-end encryption key (AES-GCM).
// Both phones run the same code, so they derive the same key. Content on
// the wire is always ciphertext.
export const E2E_SECRET = 'our-sacred-place::c1a7d9e2-6f04-4b3a-9e88-af12neymamiguel::keep-us-safe';

// Public MQTT-over-WebSocket brokers (no account needed). Both phones always
// try these in the SAME order, so they converge on the first one that works.
// The eclipse entry is on port 443 — useful on networks that block high ports.
export const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://mqtt.eclipseprojects.io/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

export const TOPICS = {
  msg: `osp/${ROOM_ID}/msg`,
  ctrl: `osp/${ROOM_ID}/ctrl`,
  status: `osp/${ROOM_ID}/status`,
  presence: (user) => `osp/${ROOM_ID}/presence/${user}`,
  presenceWild: `osp/${ROOM_ID}/presence/+`,
};

// Max bytes per MQTT payload chunk (media is split to stay under broker caps).
export const CHUNK_SIZE = 60 * 1024;
