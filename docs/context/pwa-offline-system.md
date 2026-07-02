# PWA & Service Worker — Waiter Panel

## What this system does (and what it doesn't)

The Service Worker for `/waiter` provides **performance and resilience against brief connection drops**. It does NOT enable true offline functionality.

**The waiter cannot operate without internet.** All order data, table state, authentication, and real-time updates come from `/api/*` routes, which are always NetworkOnly. If the restaurant loses internet for 10 minutes, the waiter cannot take orders.

### What the SW actually solves

1. **Speed on slow/congested restaurant Wi-Fi** — JS/CSS chunks are CacheFirst after the first load. Repeat navigations feel instant.
2. **No accidental logout on connection blip** — without the SW + `navigator.onLine` guard, a 2-second Wi-Fi drop causes `GET /api/waiter/me` to fail → `.catch()` → `setIsWaiter(false)` → redirect to PIN. The guard prevents this.
3. **Controlled degradation** — instead of a browser "no internet" dinosaur page, the waiter sees the cached HTML shell with a custom offline overlay and a "Retry" button.

Both the Service Worker and the Capacitor Android app are **already in production**.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 /waiter panel                       │
│  Next.js App Router  ·  React 18  ·  Supabase RT   │
└──────────────────────────┬──────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │    Service Worker       │  public/sw.js
              │    scope: /waiter       │  vanilla JS, no Workbox
              └────────┬────────────────┘
                       │
        ┌──────────────┼─────────────────┐
        ▼              ▼                 ▼
  CacheFirst      NetworkFirst      NetworkOnly
  /_next/static/  /waiter/*         /api/*
  (chunks)        bell.mp3          (auth/state)
```

**Scope**: `{ scope: '/waiter' }` — the SW intercepts requests **only** from pages under `/waiter/*`. It has zero impact on the public menu, store mode, or admin panel.

---

## Cache Strategies

### CacheFirst — `/_next/static/`

Content-hashed chunks (`_next/static/chunks/*.js`, CSS, fonts). Once cached, never re-fetched from network. Safe because the hash changes on every deploy.

### NetworkFirst with offline fallback — `/waiter/*` and `bell.mp3`

1. Fetch from network.
2. If network succeeds → cache response → return it.
3. If network fails → serve from cache.
4. If neither → redirect to `/waiter/offline`.

**What this means in practice**: after loading the panel online at least once, the HTML shell and JS chunks are cached. On a brief Wi-Fi drop the waiter sees the last-known UI. Orders and real-time data (API calls) are not available, but the app does not crash.

### NetworkOnly — `/api/*`

API calls are never cached. Auth state, order data, and payment state must always be fresh. Caching them would be dangerous (stale order counts, stale auth tokens).

### GET-only guard

The SW ignores all non-GET requests (`event.request.method !== 'GET'`). POST/PATCH/DELETE calls for order mutations, PIN login, and payments always go to the network.

---

## Key Files

| File | Role |
|------|------|
| `public/sw.js` | Service Worker — vanilla JS, three strategies, no Workbox |
| `src/components/sw-registrar.tsx` | Registers the SW on mount — production only, client component |
| `src/app/waiter/offline/page.tsx` | Static fallback shown when shell+network both fail |
| `src/proxy.ts` | CSP: `worker-src 'self'` added to allow SW registration |
| `next.config.mjs` | CSP fallback header: same `worker-src 'self'` |
| `src/app/layout.tsx` | Mounts `<SwRegistrar />` outside ThemeProvider near `</body>` |

---

## Offline Fallback Page (`/waiter/offline`)

Pre-cached during the SW `install` event (before any user navigation). This breaks the catch-22: the SW cannot serve the offline page from cache if it was never cached to begin with.

- `export const dynamic = 'force-static'` — Next.js generates it as a static HTML file.
- Dark background, wifi-off SVG, "Reintentar" button → `location.reload()`.
- No metadata export (incompatible with `'use client'`).

---

## Critical Gotchas

### navigator.onLine guard in WaiterBanner

`WaiterBanner` calls `GET /api/waiter/me` to verify auth. When offline, this throws `TypeError: Failed to fetch`, which is caught by `.catch(() => setIsWaiter(false))`. Without a guard, the redirect-to-login effect fires and the waiter loses their session view.

**Fix applied** in `waiter-banner.tsx`:
```typescript
useEffect(() => {
  if (!authChecked || isWaiter) return;
  if (!navigator.onLine) return;  // network errors are not auth failures
  if (pathname.startsWith('/waiter/')) {
    globalThis.location.href = '/waiter';
  }
}, [authChecked, isWaiter, pathname]);
```

### SW only runs in production

`SwRegistrar` checks `process.env.NODE_ENV !== 'production'` and skips registration in dev mode. This is intentional — the SW would interfere with Next.js HMR and make dev iteration painful. Test the SW with `pnpm build && pnpm start`.

### DevTools 0-byte display bug

Chrome DevTools Cache Storage viewer shows `0 B` for gzip-encoded cached responses. This is a DevTools rendering bug. The content is real — verified via `arrayBuffer()` (HTML shell: ~24 KB, JS chunks: ~18 KB each).

### RSC prefetch payloads are not cached

Next.js App Router client-side navigation issues `text/x-component` RSC fetch requests. The SW's `isWaiterHtml` guard (`content-type.includes('text/html')`) correctly excludes these from the NetworkFirst cache. Only the full HTML shell is cached, not RSC delta payloads.

### SonarLint S7764 — `self` vs `globalThis` in SW

`public/sw.js` lives outside the TypeScript compilation. SonarLint flags `self.skipWaiting()` and `self.clients.claim()` as non-standard globals. Use `globalThis.skipWaiting()` and `globalThis.clients.claim()` instead — functionally identical in SW context.

---

## SW Lifecycle

```
install  → cache /waiter/offline → skipWaiting() (activate immediately)
activate → delete old caches     → clients.claim() (control open tabs)
fetch    → route by strategy
```

`skipWaiting()` + `clients.claim()` means a new SW version takes over **without requiring a browser refresh**. Old caches are cleaned up in the `activate` handler by comparing against `CACHE_NAME`.

To bump the cache version: change `const CACHE_NAME = 'waiter-v1'` to `'waiter-v2'`. On next deploy the old cache is purged and all assets are re-fetched.

---

## Capacitor Android — IMPLEMENTADO

El Service Worker es la base de la capa offline. La capa nativa (Capacitor) ya está implementada y en producción.

**Documentación completa:** `docs/context/capacitor-android-pda.md`

**Qué aporta Capacitor sobre el SW:**
- APK distribuible via MDM o instalación directa (sin Play Store)
- Push notifications nativas por FCM (sin prompt de permisos del browser)
- Wake lock de pantalla
- Auto-update con descarga e instalación silenciosa del APK

**Qué NO cambia:**
- La app Next.js y todas las rutas API son idénticas
- El SW sigue funcionando dentro del WebView
- La auth (PIN + JWT cookie) es idéntica — con `SameSite=lax` (no strict)
- Sin reescritura en Ionic/React Native — el codebase web existente se usa tal cual

---

## Testing the SW

1. `pnpm build && pnpm start` (production mode required)
2. Open `/waiter` — log in with PIN
3. Navigate around to warm the cache
4. Chrome DevTools → Application → Service Workers: confirm "active and is running"
5. Chrome DevTools → Network → Offline
6. Reload any `/waiter/*` page — should show cached shell or `/waiter/offline`
