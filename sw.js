/* מסלול · service worker v5
   Same-origin: network-first (always fresh when online, cache fallback offline).
   Fonts/CDN: cache-first (immutable). This strategy self-heals stale devices. */
const CACHE = 'maslul-v5';
const SHELL = [
  './', 'index.html', 'css/style.css',
  'js/content.js', 'js/engine.js', 'js/app.js',
  'manifest.webmanifest', 'icon.svg', 'icon-maskable.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = e.request.url.startsWith(self.location.origin);

  if (sameOrigin) {
    /* network-first: fresh files whenever online, cache only as offline fallback */
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then(hit => hit || caches.match('index.html'))
      )
    );
  } else {
    /* fonts etc.: cache-first, they never change */
    e.respondWith(
      caches.match(e.request).then(hit => hit ||
        fetch(e.request).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return res;
        })
      )
    );
  }
});
