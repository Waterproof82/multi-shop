// Service Worker — Waiter PWA
// Estrategia: CacheFirst para /_next/static/, NetworkFirst para /waiter/*
// Scope: /waiter (registrado desde sw-registrar.tsx)

const CACHE_NAME = 'waiter-v3';

// --- Install ---
// Pre-cacheamos /waiter/offline de forma proactiva durante la instalación.
// Razón: es el fallback de último recurso. Si no lo pre-cacheamos aquí,
// el camarero que nunca haya visitado esa URL antes de perder la conexión
// recibirá undefined de caches.match('/waiter/offline') → TypeError en el SW
// → pantalla genérica de error del OS en lugar del fallback controlado.
//
// event.waitUntil() mantiene el evento install activo hasta que el fetch
// de /waiter/offline se completa y se guarda en caché. Si falla (servidor
// caído al registrar el SW), el install falla y el SW no se activa —
// comportamiento correcto: sin fallback offline no tiene sentido instalarse.
//
// skipWaiting() es independiente del waitUntil: fuerza la activación
// inmediata sin esperar a que se cierren las pestañas del SW anterior.
// Crítico para restaurantes: un comandero nunca cierra la pestaña.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add('/waiter/offline'))
  );
  globalThis.skipWaiting();
});

// --- Activate ---
// clients.claim() toma el control de las pestañas abiertas inmediatamente
// sin necesidad de que el usuario recargue la página.
// Limpia también cachés de versiones anteriores para evitar acumulación.
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
  // Salvaguarda crítica: Cache API solo acepta GET.
  // cache.put() lanza TypeError para POST/PUT/DELETE/PATCH.
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // NetworkOnly absoluto para APIs — nunca cachear datos de autenticación,
  // estados de pedidos o cualquier respuesta con Cache-Control: no-store.
  if (url.pathname.startsWith('/api/')) return;

  // CacheFirst para chunks estáticos de Next.js.
  // Son content-hashed: el nombre del archivo cambia en cada build,
  // por lo que nunca habrá un hit de caché para un archivo que ya no existe.
  // Next.js les pone Cache-Control: immutable, pero el HTTP cache del navegador
  // puede ser desalojado bajo presión de memoria en dispositivos Android.
  // El SW Cache API es más persistente.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // NetworkFirst para navegación /waiter/* y assets estáticos del panel.
  // Incluye bell.mp3 para notificaciones de sonido offline.
  if (url.pathname.startsWith('/waiter') || url.pathname === '/bell.mp3') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Guardamos en caché solo si:
          //   A) Es una ruta /waiter/* AND la respuesta es text/html válido
          //      (filtra redirects y respuestas inesperadas de Next.js).
          //   B) Es un asset no-HTML como bell.mp3 (audio/mpeg) → status 200 basta.
          // Condición: status 200 AND (es text/html OR no es ruta /waiter).
          // Nota: NO previene "zombie HTML" de error boundaries (retornan 200
          // text/html igualmente), pero NetworkFirst lo mitiga: la caché
          // se sobreescribe en el siguiente request exitoso con red disponible.
          const contentType = response.headers.get('content-type') ?? '';
          // Cache both the initial HTML page load AND the RSC payloads that
          // Next.js App Router fetches during client-side navigation (text/x-component).
          // Without caching RSC payloads, offline navigation between /waiter/* pages
          // fails with a blank screen even though the HTML shell is cached.
          const isWaiterHtml =
            url.pathname.startsWith('/waiter') &&
            (contentType.includes('text/html') || contentType.includes('text/x-component'));
          const isNonWaiterAsset = !url.pathname.startsWith('/waiter'); // bell.mp3

          if (response.status === 200 && (isWaiterHtml || isNonWaiterAsset)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            // /waiter/offline está garantizado en caché desde el evento install.
            (cached) => cached ?? caches.match('/waiter/offline')
          )
        )
    );
  }

  // Resto de recursos (menú público, admin, etc.): sin interceptar.
  // El SW tiene scope /waiter, pero requests de otras rutas que pasen
  // por aquí (ej. recursos compartidos) se dejan fluir normalmente.
});
