const CACHE = 'certswap-7a2255b';

const PRECACHE = [
  '/',
  '/index.html',
  '/activate.html',
  '/wallet.html',
  '/exchange.html',
  '/pay.html',
  '/gift.html',
  '/verify.html',
  '/scan.html',
  '/merchant.html',
  '/profile.html',
  '/brands.html',
  '/how-it-works.html',
  '/about.html',
  '/css/style.css',
  '/js/api.js',
  '/js/provider.js',
  '/js/web3.js',
  '/js/i18n.js',
  '/js/pwa.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  // Skip non-GET and API/admin requests — always network for those
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/admin-api/') ||
      url.pathname.startsWith('/admin')) return;

  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (response) {
        // Cache only same-origin successful responses for static assets
        if (response.ok && url.origin === self.location.origin) {
          var clone = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(e.request, clone); });
        }
        return response;
      });
    })
  );
});
