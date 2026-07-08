// Service Worker — Kitchen PWA
// Estrategia: CacheFirst para /_next/static/, NetworkFirst para /kitchen/*
// Scope: /kitchen (registrado desde src/components/kitchen/sw-registrar.tsx)

const CACHE_NAME = 'kitchen-v1';

// --- Install ---
// Pre-cacheamos /kitchen/offline de forma proactiva durante la instalación.
// Sin esto, si el cocinero nunca visitó esa URL antes de perder la conexión,
// caches.match('/kitchen/offline') devuelve undefined → pantalla de error del OS.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/kitchen/offline'))
  );
  globalThis.skipWaiting();
});

// --- Activate ---
// clients.claim() toma el control inmediatamente sin recargar.
// Limpia cachés de versiones anteriores para evitar acumulación en disco.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => globalThis.clients.claim())
  );
});

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  // Solo interceptar GET — Cache API no acepta otros métodos.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // NetworkOnly absoluto para APIs — nunca cachear estados de pedidos.
  if (url.pathname.startsWith('/api/')) return;

  // CacheFirst para chunks estáticos de Next.js (content-hashed, immutable).
  // El SW Cache API es más persistente que el HTTP cache en Android bajo presión de memoria.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, clone); });
          }
          return response;
        });
      })
    );
    return;
  }

  // NetworkFirst para /kitchen/* — siempre intenta red primero.
  // Cachea HTML y RSC payloads (text/x-component) para navegación offline.
  // Fallback garantizado a /kitchen/offline (pre-cacheado en install).
  if (url.pathname.startsWith('/kitchen') || url.pathname === '/bell.mp3') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const contentType = response.headers.get('content-type') ?? '';
          const isKitchenHtml =
            url.pathname.startsWith('/kitchen') &&
            (contentType.includes('text/html') || contentType.includes('text/x-component'));
          const isSharedAsset = !url.pathname.startsWith('/kitchen'); // bell.mp3

          if (response.status === 200 && (isKitchenHtml || isSharedAsset)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, clone); });
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (cached) => cached ?? caches.match('/kitchen/offline')
          )
        )
    );
  }
});
