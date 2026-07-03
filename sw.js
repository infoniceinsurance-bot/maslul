/* מסלול · service worker: cache-first shell so the app works offline after first visit */
const CACHE = 'maslul-v1';
const SHELL = [
  './', 'index.html', 'css/style.css',
  'js/content.js', 'js/engine.js', 'js/app.js',
  'manifest.webmanifest', 'icon.svg', 'icon-maskable.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => {
        /* cache fonts and same-origin files on the fly */
        const url = e.request.url;
        if (res.ok && (url.startsWith(self.location.origin) || url.includes('fonts.g'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'))
    )
  );
});
