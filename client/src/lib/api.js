import { getToken } from './auth.js';

export async function api(path, opts = {}) {
  const token = getToken();
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) throw new Error(`${res.status}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

export function mediaUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const token = getToken();
  const sep = pathOrUrl.includes('?') ? '&' : '?';
  return `${pathOrUrl}${sep}token=${encodeURIComponent(token || '')}`;
}

export async function uploadFile(file) {
  const fd = new FormData();
  fd.append('file', file);
  return api('/api/upload', { method: 'POST', body: fd });
}

export async function fetchMessagesSince(since) {
  return api(`/api/messages?since=${since || 0}`);
}
export async function fetchStatuses() {
  return api('/api/statuses');
}
export async function markStatusViewed(id) {
  return api(`/api/statuses/${id}/view`, { method: 'POST' });
}
export async function updateProfile(displayName) {
  return api('/api/profile', { method: 'PUT', body: JSON.stringify({ displayName }) });
}
export async function uploadAvatar(file) {
  const fd = new FormData();
  fd.append('file', file);
  return api('/api/profile/avatar', { method: 'POST', body: fd });
}
export async function fetchMe() {
  return api('/api/me');
}
