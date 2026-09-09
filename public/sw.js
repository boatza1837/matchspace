/**
 * MatchSpace Service Worker
 * Handles background Web Push Notifications and quick app opening.
 */

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'MatchSpace', body: event.data ? event.data.text() : 'คุณมีการแจ้งเตือนใหม่' };
  }

  const title = data.title || 'MatchSpace';
  const options = {
    body: data.body || 'มีข้อความหรือการแมตช์ใหม่รอคุณอยู่',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    data: {
      url: data.url || '/app'
    },
    vibrate: [100, 50, 100],
    actions: [
      { action: 'open', title: 'เปิดดูทันที' },
      { action: 'close', title: 'ปิด' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  const urlToOpen = (event.notification.data && event.notification.data.url) || '/app';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/app') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
