/* Service worker — lưu sẵn file giao diện để mở app nhanh và xem được khi mất mạng.
 * ⚠️ MỖI LẦN TẢI FILE MỚI LÊN GITHUB: tăng số VERSION bên dưới (v1 → v2 → v3…)
 *    để điện thoại nhận bản mới. Dữ liệu (API Apps Script) luôn lấy từ mạng.
 */
const VERSION = 'qlcd-v5';
const CORE = [
  './', './index.html', './style.css', './i18n.js', './qr.js', './app.js',
  './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'
];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE);
    // Thư viện quét QR: cố gắng lưu sẵn, lỗi mạng thì bỏ qua (sẽ lưu khi dùng lần đầu)
    await Promise.all(CDN.map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => null)));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('qlcd-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return; // API Apps Script dùng POST → luôn đi mạng
  const url = new URL(req.url);

  // Mở app (kể cả link ?id=TB0001 từ mã QR) → trang index.html đã lưu
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match('./index.html');
      if (hit) return hit;
      try { return await fetch(req); } catch (e) { return new Response('Offline', { status: 503 }); }
    })());
    return;
  }

  // File tĩnh cùng nguồn và thư viện cdnjs: ưu tiên bản đã lưu
  if (url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: url.origin === self.location.origin });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
      return res;
    })());
  }
});
