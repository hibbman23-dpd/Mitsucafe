// Service Worker — Mitsu Cafe (Lâm Hà Kissaten)
// Chiến lược: HTML = network-first (luôn tươi, offline mới rơi về cache);
//             tài nguyên tĩnh = stale-while-revalidate (trả cache nhanh + cập nhật ngầm).
// POST (đặt hàng) luôn online. Bump CACHE khi cần xoá sạch cache cũ.

const CACHE = 'lhk-v6';
// Query ?v= phải khớp y hệt index.html — cache key tính cả query, lệch một ký tự
// là precache trượt (nằm im trong cache, không ai dùng) và khách vẫn chạy bản cũ.
const SHELL = [
  './', './index.html', './mitsu.html',
  './style.css?v=20260810a', './mitsu.css', './mitsu-landing.css',
  './order.js?v=20260810a', './menu-data.js?v=20260810a', './mitsu-theme.js', './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                  // POST đặt hàng → online
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // cross-origin (Google Fonts…) → để trình duyệt lo

  // Điều hướng trang (HTML) → network-first
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Tài nguyên tĩnh → stale-while-revalidate
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
