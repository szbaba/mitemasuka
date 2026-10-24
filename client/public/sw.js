const CACHE_NAME = 'minitemas-pwa-v4';
const WS_HTTP_BASE = 'https://ws.mitemasuka.com';

let savedClientId = '';
let savedRegion = 'global-hub-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SET_CLIENT_META') {
    if (data.clientId) savedClientId = String(data.clientId);
    if (data.region) savedRegion = String(data.region);
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  try {
    const reqUrl = new URL(event.request.url);
    // Dış API / çeviri isteklerine ve _next/api rotalarına müdahale etme
    if (reqUrl.origin !== self.location.origin) return;
    if (reqUrl.pathname.startsWith('/api/')) return;
  } catch {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      return cached || Response.error();
    })
  );
});

self.addEventListener('push', (event) => {
  const handlePush = async () => {
    let title = 'Beni Görüyor Musun?';
    let body = '100m çevrende biri odaya girdi.';

    if (event.data) {
      try {
        const parsed = event.data.json();
        if (parsed?.title) title = parsed.title;
        if (parsed?.body) body = parsed.body;
      } catch {}
    }

    if (savedClientId) {
      try {
        const res = await fetch(
          `${WS_HTTP_BASE}/push-info?clientId=${encodeURIComponent(
            savedClientId
          )}&region=${encodeURIComponent(savedRegion)}`,
          { cache: 'no-store' }
        );
        if (res.ok) {
          const info = await res.json();
          if (info?.title) title = info.title;
          if (info?.body) body = info.body;
        }
      } catch {}
    }

    await self.registration.showNotification(title, {
      body,
      icon: '/apple-touch-icon.png?v=2',
      badge: '/apple-touch-icon.png?v=2',
      tag: 'mitemasuka-nearby-wake',
      renotify: true,
      data: { url: '/' },
    });
  };

  event.waitUntil(handlePush());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
