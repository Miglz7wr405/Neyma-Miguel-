// Imported into the generated service worker. Focuses/opens the app when a
// notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if ('focus' in c) return c.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(self.registration.scope);
      }),
  );
});
