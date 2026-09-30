// Local notifications (no push server). Fires while the app is open or in the
// background (page alive). Will NOT fire when the app is fully closed for long.

export async function ensureNotifyPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

export function canNotify() {
  return 'Notification' in window && Notification.permission === 'granted';
}

export async function notify(title, body, opts = {}) {
  if (!canNotify()) return;
  // Only notify when the user isn't actively looking at the app.
  if (document.visibilityState === 'visible' && !opts.force) return;
  const options = {
    body,
    icon: opts.icon || `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    tag: opts.tag || 'osp-msg',
    renotify: true,
    vibrate: [80, 40, 80],
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.showNotification) {
      await reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch {
    try { new Notification(title, options); } catch {}
  }
}
