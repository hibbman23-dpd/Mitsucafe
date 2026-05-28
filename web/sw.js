// Service Worker — Lâm Hà Kissaten
// Cache shell files → offline menu view. POST (đặt hàng) luôn online.

const CACHE = 'lhk-v4';
const SHELL = ['./','./index.html','./style.css','./order.js','./menu-data.js','./manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // POST (gửi đơn) → network only, không cache
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache các file tĩnh
        if (res.ok && SHELL.some(u => e.request.url.endsWith(u.replace('./',''))))  {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached); // Offline fallback: trả về cache cũ
    })
  );
});
