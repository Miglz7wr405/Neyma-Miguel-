// End-to-end encryption for everything published to the public broker.
// AES-GCM 256, key derived from the shared secret via PBKDF2.

import { E2E_SECRET } from './config.js';

let keyPromise = null;

async function getKey() {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(E2E_SECRET),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode('osp-static-salt-neyma-miguel'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  })();
  return keyPromise;
}

function b64(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function unb64(str) {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Returns a compact string "iv.ciphertext" (both base64).
export async function encryptJSON(obj) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decryptJSON(payload) {
  try {
    const key = await getKey();
    const [ivB64, ctB64] = String(payload).split('.');
    if (!ivB64 || !ctB64) return null;
    const iv = unb64(ivB64);
    const ct = unb64(ctB64);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null; // not for us / wrong key / corrupt
  }
}
