// Fully client-side auth. No server: the two accounts live in config.js.
// The lock screen compares a hash of the entered password against what was
// stored on first successful login, so unlocking works offline.

import { findUser, partnerOf } from './config.js';

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

export function getUser() {
  const s = localStorage.getItem(USER_KEY);
  return s ? JSON.parse(s) : null;
}
export function getPartner() {
  const s = localStorage.getItem(PARTNER_KEY);
  return s ? JSON.parse(s) : null;
}

export async function login({ phone, password }) {
  const user = findUser(phone, password);
  if (!user) throw new Error('Número ou palavra-passe errados');
  const partner = partnerOf(user.id);
  const pubUser = { id: user.id, name: user.name, phone: user.phone };
  const pubPartner = { id: partner.id, name: partner.name, phone: partner.phone };
  localStorage.setItem(USER_KEY, JSON.stringify(pubUser));
  localStorage.setItem(PARTNER_KEY, JSON.stringify(pubPartner));
  localStorage.setItem(PWHASH_KEY, await sha256(password));
  sessionStorage.setItem(LOCKED_KEY, '0');
  return { user: pubUser, partner: pubPartner };
}

export function logout() {
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PARTNER_KEY);
  localStorage.removeItem(PWHASH_KEY);
  sessionStorage.removeItem(LOCKED_KEY);
}

export function isLoggedIn() {
  return !!getUser() && !!localStorage.getItem(PWHASH_KEY);
}

export async function tryUnlock(password) {
  const stored = localStorage.getItem(PWHASH_KEY);
  if (!stored) return false;
  const ok = stored === (await sha256(password));
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

// My own profile (display name + avatar data URL), broadcast to the partner.
const PROFILE_KEY = 'osp:profile';
export function getProfile() {
  const s = localStorage.getItem(PROFILE_KEY);
  return s ? JSON.parse(s) : {};
}
export function saveProfile(p) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...getProfile(), ...p }));
}

// Partner's broadcast profile (name + avatar), received over the channel.
const PARTNER_PROFILE_KEY = 'osp:partnerProfile';
export function getPartnerProfile() {
  const s = localStorage.getItem(PARTNER_PROFILE_KEY);
  return s ? JSON.parse(s) : {};
}
export function savePartnerProfile(p) {
  localStorage.setItem(PARTNER_PROFILE_KEY, JSON.stringify({ ...getPartnerProfile(), ...p }));
}

// Local nickname I gave the partner (like renaming a contact). Device-only.
const ALIAS_KEY = 'osp:partnerAlias';
export function getPartnerAlias() {
  return localStorage.getItem(ALIAS_KEY) || '';
}
export function savePartnerAlias(name) {
  if (name) localStorage.setItem(ALIAS_KEY, name);
  else localStorage.removeItem(ALIAS_KEY);
}

// The name to show for the partner: my nickname > their broadcast name > default.
export function partnerDisplayName(partner) {
  return getPartnerAlias() || getPartnerProfile().name || partner.name;
}
export function myDisplayName(me) {
  return getProfile().displayName || me.name;
}
