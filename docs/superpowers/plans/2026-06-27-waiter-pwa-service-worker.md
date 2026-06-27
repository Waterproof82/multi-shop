# Waiter PWA — Service Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un Service Worker vanilla (sin dependencias) que cachee las rutas `/waiter/*` y los chunks estáticos de Next.js, permitiendo que el panel de sala funcione con resiliencia ante microcortes de Wi-Fi en dispositivos físicos (Android PDAs vía Capacitor, TPVs Windows vía Electron).

**Architecture:** Service Worker en `/public/sw.js` con dos estrategias: CacheFirst para `/_next/static/` (assets content-hashed, inmutables entre requests) y NetworkFirst para `/waiter/*` (navegación + assets de `/public`). El SW cubre solo el scope `/waiter` para no interferir con el panel admin ni con las rutas del menú público. Un client component `SwRegistrar` monta el registro solo en producción. La ruta `/waiter/offline` actúa como fallback estático cuando la red y el caché ambos fallan.

**Tech Stack:** Vanilla JS (Cache API, Service Worker API), Next.js 16 App Router, TypeScript (solo para el componente de registro), Tailwind CSS v4 + variables CSS inline para la página offline.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/proxy.ts` | Modificar | Añadir `worker-src 'self'` a `buildCsp()` |
| `next.config.mjs` | Modificar | Añadir `worker-src 'self'` a `cspFallback` |
| `public/sw.js` | Crear | Service Worker vanilla — lógica de caché |
| `src/components/sw-registrar.tsx` | Crear | Client component que registra el SW (solo prod) |
| `src/app/waiter/offline/page.tsx` | Crear | Página fallback offline estática |
| `src/app/layout.tsx` | Modificar | Montar `<SwRegistrar />` en el root layout |

---

## Task 1: Añadir `worker-src 'self'` a la CSP

**Files:**
- Modify: `src/proxy.ts` (función `buildCsp`, líneas ~213-227)
- Modify: `next.config.mjs` (constante `cspFallback`, líneas ~26-40)

Sin este cambio, Chrome y Edge bloquean el registro del Service Worker porque `worker-src` hace fallback a `script-src`, que en producción tiene `'nonce-{nonce}' 'strict-dynamic'` — ninguno de los dos cubre un archivo estático `/sw.js` sin nonce.

- [ ] **Step 1: Modificar `buildCsp()` en `src/proxy.ts`**

Localizar el array que construye la CSP en `buildCsp()` (alrededor de la línea 213). Añadir `"worker-src 'self'"` después de la línea `"font-src 'self'"`:

```typescript
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources}`,
    `media-src ${mediaSources}`,
    "font-src 'self'",
    "worker-src 'self'",   // ← AÑADIR esta línea
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.brevo.com https://*.upstash.io https://api.mapbox.com https://events.mapbox.com${connectR2}${devConnectSrc}`,
    "frame-src 'self' https://www.google.com https://maps.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://sis-t.redsys.es:25443 https://sis.redsys.es",
    frameAncestors,
    "report-uri /api/csp-report",
  ].join('; ');
```

- [ ] **Step 2: Modificar `cspFallback` en `next.config.mjs`**

Localizar la constante `cspFallback` (alrededor de la línea 26). Añadir `"worker-src 'self'"` después de `"font-src 'self'"`:

```javascript
const cspFallback = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  `media-src ${mediaSrc}`,
  "font-src 'self'",
  "worker-src 'self'",   // ← AÑADIR esta línea
  "connect-src 'self' https://*.supabase.co https://api.brevo.com https://*.upstash.io",
  "frame-src 'self' https://www.google.com https://maps.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join('; ') + ';';
```

- [ ] **Step 3: Verificar lint y build**

```bash
pnpm lint && pnpm build
```

Esperado: sin errores. El build genera `.next/` sin warnings de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts next.config.mjs
git commit -m "feat(csp): add explicit worker-src 'self' for service worker support"
```

---

## Task 2: Página offline `/waiter/offline`

**Files:**
- Create: `src/app/waiter/offline/page.tsx`

Esta página es el último fallback cuando (1) la red no está disponible Y (2) el caché del SW no tiene la ruta solicitada. Es completamente estática — sin fetch, sin hooks de red, sin Realtime. El SW la sirve a través de `caches.match('/waiter/offline')`.

- [ ] **Step 1: Crear `src/app/waiter/offline/page.tsx`**

```tsx
import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function WaiterOfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center"
      style={{ background: 'oklch(13% 0.02 252)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'oklch(20% 0.04 252)' }}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(55% 0.08 252)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <div>
        <h1
          className="text-xl font-semibold mb-2"
          style={{ color: 'oklch(92% 0.02 252)' }}
        >
          Sin conexión Wi-Fi
        </h1>
        <p
          className="text-sm max-w-xs"
          style={{ color: 'oklch(58% 0.05 252)' }}
        >
          La app se reconectará automáticamente cuando vuelva la señal. Comprobá
          que el dispositivo está conectado a la red del local.
        </p>
      </div>

      <button
        type="button"
        onClick={() => globalThis.location.reload()}
        className="mt-2 px-5 py-2.5 rounded-lg text-sm font-medium"
        style={{
          background: 'oklch(28% 0.06 252)',
          color: 'oklch(85% 0.05 252)',
          border: '1px solid oklch(35% 0.05 252)',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
```

Nota: el botón "Reintentar" llama a `location.reload()`, que hará que el SW intente NetworkFirst de nuevo. Si la red volvió, carga la app. Si no, vuelve a esta página desde caché.

- [ ] **Step 2: Verificar lint y build**

```bash
pnpm lint && pnpm build
```

Esperado: sin errores. La página aparece en `.next/` como ruta estática.

- [ ] **Step 3: Commit**

```bash
git add src/app/waiter/offline/page.tsx
git commit -m "feat(waiter): add static offline fallback page for service worker"
```

---

## Task 3: Service Worker vanilla

**Files:**
- Create: `public/sw.js`

Este archivo es JavaScript plano (no TypeScript) porque vive en `/public` y Next.js lo sirve tal cual sin compilación. El SW gestiona tres tipos de recursos con estrategias distintas:

- `/_next/static/**`: **CacheFirst** — estos archivos tienen hashes de contenido en el nombre. Si ya están en caché, son válidos para siempre. Se cachean la primera vez que se cargan (runtime caching).
- `/waiter/**` y `bell.mp3`: **NetworkFirst** — intenta red primero, guarda en caché la respuesta exitosa, y en fallo sirve lo que haya en caché. Si no hay nada en caché, sirve `/waiter/offline`.
- `/api/**`: **NetworkOnly** — nunca cachear respuestas de API (contienen datos de auth y estado de DB).
- Todo lo demás: sin interceptar.

La salvaguarda GET garantiza que `cache.put()` nunca reciba una petición POST/PUT/DELETE (la Cache API lanza TypeError para métodos no-GET).

- [ ] **Step 1: Crear `public/sw.js`**

```javascript
// Service Worker — Waiter PWA
// Estrategia: CacheFirst para /_next/static/, NetworkFirst para /waiter/*
// Scope: /waiter (registrado desde sw-registrar.tsx)

const CACHE_NAME = 'waiter-v1';

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
  self.skipWaiting();
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
      .then(() => self.clients.claim())
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
          //   A) Es una ruta /waiter/* Y la respuesta es text/html válido
          //      (filtra redirects y respuestas inesperadas de Next.js).
          //   B) Es un asset no-HTML como bell.mp3 (audio/mpeg) → status 200 basta.
          // Condición: status 200 AND (es text/html OR no es ruta /waiter).
          // Nota: NO previene "zombie HTML" de error boundaries (retornan 200
          // text/html igualmente), pero NetworkFirst lo mitiga: la caché
          // se sobreescribe en el siguiente request exitoso con red disponible.
          const isWaiterHtml =
            url.pathname.startsWith('/waiter') &&
            (response.headers.get('content-type') ?? '').includes('text/html');
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
```

- [ ] **Step 2: Verificar que el archivo es JS válido**

```bash
node --check public/sw.js
```

Esperado: sin output (sin errores de sintaxis).

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat(waiter): add vanilla service worker with NetworkFirst + CacheFirst strategies"
```

---

## Task 4: Componente de registro del Service Worker

**Files:**
- Create: `src/components/sw-registrar.tsx`

Client component que registra `sw.js` con scope `/waiter`. Solo se activa en producción (`process.env.NODE_ENV === 'production'`) para no interferir con el hot-reload de Next.js en desarrollo. Renderiza `null` — no produce DOM.

- [ ] **Step 1: Crear `src/components/sw-registrar.tsx`**

```tsx
'use client';

import { useEffect } from 'react';

export function SwRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/waiter' })
      .catch(() => {
        // Fallo silencioso — el SW es una mejora progresiva.
        // La app funciona sin él; solo pierde la resiliencia offline.
      });
  }, []);

  return null;
}
```

- [ ] **Step 2: Verificar lint**

```bash
pnpm lint
```

Esperado: sin errores en `src/components/sw-registrar.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/sw-registrar.tsx
git commit -m "feat(waiter): add SwRegistrar client component for production SW registration"
```

---

## Task 5: Montar SwRegistrar en el root layout

**Files:**
- Modify: `src/app/layout.tsx`

El layout raíz ya importa múltiples client components (`WaiterBanner`, `ExitConfirmation`, `Toaster`, etc.). Añadir `SwRegistrar` sigue el mismo patrón establecido.

- [ ] **Step 1: Añadir import en `src/app/layout.tsx`**

Localizar el bloque de imports al inicio del archivo (alrededor de la línea 1-17). Añadir el import de `SwRegistrar`:

```tsx
import { SwRegistrar } from '@/components/sw-registrar';
```

El bloque de imports completo quedará así (los imports existentes sin cambios, solo añadir la última línea):

```tsx
import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { LazyPromoToast, LazyTgtgReservaPopup } from "@/components/lazy-client-components";
import { WaiterBanner } from "@/components/waiter-banner";
import { ExitConfirmation } from "@/components/exit-confirmation";
import { getEmpresaByDomain } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import type { EmpresaPublic } from "@/core/domain/entities/types";
import { SwRegistrar } from '@/components/sw-registrar';   // ← AÑADIR
```

- [ ] **Step 2: Montar `<SwRegistrar />` en el body**

Localizar el return del componente `RootLayout` (alrededor de la línea 158). Añadir `<SwRegistrar />` justo antes del cierre del `<body>`, después de `<LazyTgtgReservaPopup />`:

```tsx
      </CartProvider>
    </LanguageProvider>
  </ErrorBoundary>
</ThemeProvider>
<SwRegistrar />   {/* ← AÑADIR — fuera del ThemeProvider para no bloquear el render */}
</body>
```

El bloque completo del body queda así:

```tsx
  <body className={`${inter.variable} ${playfair.variable} font-sans`} suppressHydrationWarning>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      <ErrorBoundary>
        <LanguageProvider>
          <CartProvider>
            <ExitConfirmation />
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Saltar al contenido principal
            </a>
            <Suspense>
              <WaiterBanner />
            </Suspense>
            <main id="main-content">
              {children}
            </main>
            <Toaster />
            <LazyPromoToast />
            <LazyTgtgReservaPopup />
          </CartProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </ThemeProvider>
    <SwRegistrar />
  </body>
```

- [ ] **Step 3: Verificar lint y build**

```bash
pnpm lint && pnpm build
```

Esperado: sin errores. El build compila correctamente todos los archivos nuevos y modificados.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(waiter): mount SwRegistrar in root layout for PWA service worker"
```

---

## Task 6: Verificación manual en producción

Este task no produce código. Es la verificación funcional de que todo el sistema funciona end-to-end.

- [ ] **Step 1: Build y start en modo producción**

```bash
pnpm build && pnpm start
```

- [ ] **Step 2: Verificar registro del SW en DevTools**

Abrir Chrome → `http://localhost:3000/waiter` → DevTools → Application → Service Workers.

Esperado:
- Source: `sw.js`
- Status: `activated and is running`
- Scope: `http://localhost:3000/waiter`

Si el SW no aparece, revisar la consola del navegador para errores CSP (`Content Security Policy`). Si hay un error `worker-src`, verificar que Task 1 está aplicado correctamente.

- [ ] **Step 3: Verificar caché en DevTools**

DevTools → Application → Cache Storage → `waiter-v1`.

Navegar a `/waiter`, `/waiter/kitchen`, `/waiter/bar`. Esperado: las rutas y los chunks `_next/static/` aparecen en el caché.

- [ ] **Step 4: Simular offline**

DevTools → Network → Throttling → Offline. Recargar `/waiter/kitchen`.

Esperado: la página carga desde el caché (sin errores de red en la consola). Las rutas ya visitadas responden. Las no visitadas muestran `/waiter/offline`.

- [ ] **Step 5: Verificar actualización automática del SW**

Cambiar el valor de `CACHE_NAME` en `public/sw.js` de `'waiter-v1'` a `'waiter-v2'`. Rebuild y refrescar la pestaña. En DevTools → Application → Service Workers, verificar que el nuevo SW pasa directamente a `activated` (sin quedarse en `waiting`).

Revertir el cambio de nombre a `'waiter-v1'` y hacer commit de la verificación si todo OK.

---

## Self-Review

### Cobertura de spec

| Requisito | Task |
|---|---|
| GET-only guard para cache.put() | Task 3 (`if (event.request.method !== 'GET') return`) |
| NetworkOnly para `/api/*` | Task 3 (Guard 2) |
| CacheFirst para `/_next/static/` | Task 3 (Handler A) |
| NetworkFirst para `/waiter/*` | Task 3 (Handler B) |
| Fallback a `/waiter/offline` | Task 3 (Handler B + Task 2) |
| `bell.mp3` en NetworkFirst | Task 3 (Handler B) |
| Pre-cache `/waiter/offline` en install | Task 3 (install con `event.waitUntil`) |
| `skipWaiting` + `clients.claim()` | Task 3 (install + activate) |
| content-type guard en NetworkFirst HTML | Task 3 (Handler B — `isWaiterHtml \| isNonWaiterAsset`) |
| Limpieza de cachés viejas | Task 3 (activate) |
| `worker-src 'self'` en proxy.ts | Task 1 |
| `worker-src 'self'` en next.config.mjs | Task 1 |
| Registro solo en producción | Task 4 |
| Scope `/waiter` | Task 4 |
| Página offline estática | Task 2 |
| Botón reintentar en offline | Task 2 |
| Sin iOS (sin consideraciones WebKit) | — (by design) |
| Sin Serwist / sin dependencias extra | — (vanilla JS puro) |

### Checklist de placeholders

- Sin TBD ni TODO en el plan
- Todo el código completo en cada step
- Tipos y nombres consistentes entre tasks (`CACHE_NAME`, `SwRegistrar`, `WaiterOfflinePage`)

### Consistencia de tipos

- `SwRegistrar` — definido en Task 4, importado en Task 5 ✓
- `CACHE_NAME = 'waiter-v1'` — usado en Task 3 install/activate/fetch, referenciado en Task 6 ✓
- `caches.match('/waiter/offline')` en Task 3 — ruta creada en Task 2 ✓
