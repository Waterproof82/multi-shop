const CACHE_NAME = 'tpv-v1';
const OFFLINE_URL = '/tpv/offline';

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  globalThis.skipWaiting();
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  globalThis.clients.claim();
});

globalThis.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // NetworkOnly para /api/* — auth y datos siempre frescos
  if (url.pathname.startsWith('/api/')) return;

  // CacheFirst para /_next/static/* — chunks content-hashed, eternos
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // NetworkFirst para /tpv/* — con fallback a página offline
  if (url.pathname.startsWith('/tpv')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          // Try cached version of the requested page first, then fallback to offline shell
          caches.match(request)
            .then((cachedPage) => cachedPage ?? caches.match(OFFLINE_URL))
            .then((fallback) => fallback ?? new Response('Sin conexión', { status: 503 }))
        )
    );
  }
});
