// Service worker ZukaiTemp: halaman selalu coba versi terbaru dulu, cadangan dari cache.
const V = 'zukaitemp-v9';
const SHELL = ['/', '/index.html', '/email.html', '/music.html', '/download.html', '/tools.html', '/base.css', '/glass.css', '/dark-sync.js', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  // API email & situs lain tidak pernah di-cache
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (r.mode === 'navigate') {
    // hanya halaman utama yang boleh menimpa cache /index.html (iframe musik dll tidak)
    const home = u.pathname === '/' || u.pathname === '/index.html';
    e.respondWith(
      fetch(r).then(res => { if (home) { const cp = res.clone(); caches.open(V).then(c => c.put('/index.html', cp)); } return res; })
        .catch(() => (home ? caches.match('/index.html') : caches.match(u.pathname).then(h => h || caches.match('/index.html'))))
    );
    return;
  }
  e.respondWith(
    caches.match(r).then(hit => hit || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }))
  );
});
