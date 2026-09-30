// Token + local lock. The lock check compares a hash of the entered password
// against what was stored the first time the user logged in successfully.

const TOKEN_KEY = 'osp:token';
const USER_KEY = 'osp:user';
const PARTNER_KEY = 'osp:partner';
const PWHASH_KEY = 'osp:pwhash';
const THEME_KEY = 'osp:theme';
const LOCKED_KEY = 'osp:locked';

async function sha256(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const s = localStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
}

export function getPartner() {
  const s = localStorage.getItem(PARTNER_KEY);
  return s ? JSON.parse(s) : null;
}

export async function login({ phone, password }) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  if (!res.ok) throw new Error('Número ou palavra-passe errados');
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  localStorage.setItem(PARTNER_KEY, JSON.stringify(data.partner));
  const hash = await sha256(password);
  localStorage.setItem(PWHASH_KEY, hash);
  sessionStorage.removeItem(LOCKED_KEY);
  return data;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PARTNER_KEY);
  localStorage.removeItem(PWHASH_KEY);
  sessionStorage.removeItem(LOCKED_KEY);
}

export async function tryUnlock(password) {
  const stored = localStorage.getItem(PWHASH_KEY);
  if (!stored) return false;
  const hash = await sha256(password);
  const ok = stored === hash;
  if (ok) sessionStorage.setItem(LOCKED_KEY, '0');
  return ok;
}

export function markLocked() {
  sessionStorage.setItem(LOCKED_KEY, '1');
}

export function isLocked() {
  return sessionStorage.getItem(LOCKED_KEY) !== '0';
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'rose';
}
export function setTheme(t) {
  localStorage.setItem(THEME_KEY, t);
  document.documentElement.setAttribute('data-theme', t);
}
