self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const targetUrl = notification?.data?.url || '/#/';

  notification?.close();

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windowClients) {
      if (!client.url.startsWith(self.location.origin)) {
        continue;
      }

      if ('navigate' in client) {
        await client.navigate(targetUrl);
      }

      if ('focus' in client) {
        await client.focus();
      }

      return;
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
