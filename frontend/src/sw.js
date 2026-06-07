/* 自訂 Service Worker：App Shell 快取 + Web Push 推播 */
/* eslint-disable no-restricted-globals */

// vite-plugin-pwa (injectManifest) 會把預快取清單注入這裡
const manifest = self.__WB_MANIFEST || [];
const CACHE = 'fruit-app-shell-v1';
const SHELL_URLS = manifest.map((e) => e.url);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([...SHELL_URLS, '/']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// App Shell：GET 導覽請求採 network-first，失敗回退快取
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io')
  )
    return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

// Web Push：背景接收新訂單通知（出貨組）
self.addEventListener('push', (event) => {
  let data = { title: '新訂單', body: '有新的待出貨訂單' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: data.order_no || 'order',
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const target = '/shipper';
      const existing = clients.find((c) => c.url.includes(target));
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })
  );
});
