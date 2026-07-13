# Sentry — Error Monitoring y Observabilidad

## Qué cubre Sentry

Sentry funciona como **segunda capa de observabilidad técnica**, complementaria a la tabla `log_errors` de Supabase.

| Capa | Qué captura | Dónde vive |
|---|---|---|
| Supabase `log_errors` | Errores de negocio con contexto de tenant (`empresa_id`, `modulo`, `metodo`) | DB propia |
| Sentry | Crashes técnicos, excepciones no manejadas, stack traces desminificados, performance, session replay | Sentry.io |

### Lo que Sentry captura y Supabase no podía

- **Errores client-side en producción** — antes eran silenciosos (`logClientError` solo logueaba en dev)
- **React error boundaries** — `error.tsx`, `global-error.tsx`, `tpv/error.tsx`
- **Unhandled promise rejections** en el browser
- **Stack traces legibles** — source maps subidos en cada build, las líneas apuntan al TypeScript original
- **Session Replay on error** — graba la sesión justo antes del crash (500 replays/mes en free tier)
- **Performance monitoring** — Web Vitals, transacciones lentas

## Arquitectura

### Inicialización por runtime

```
sentry.client.config.ts   → browser (errores, replay, Web Vitals)
sentry.server.config.ts   → Node.js (API routes, SSR)
sentry.edge.config.ts     → Edge runtime (middleware/proxy)
instrumentation.ts        → entry point de Next.js, lazy-importa server/edge según NEXT_RUNTIME
```

`instrumentation.ts` / `register()` corre **una sola vez al arrancar el servidor**, NO por request.

### Contexto multi-tenant

El `empresa_id` se inyecta como tag de Sentry en dos puntos:

```
Request entra
  └── src/app/layout.tsx (Server Component)
        ├── Sentry.setTag('empresa_id', empresa.id)  ← server scope
        └── <SentryProvider empresaId={empresa.id} /> ← client scope
              └── useEffect → Sentry.setTag('empresa_id', empresa.id)
```

Todos los errores capturados — tanto server como client — llevan el tag `empresa_id`, permitiendo filtrar por tenant en el dashboard de Sentry.

### Double-channel en ErrorLogger

```
ErrorLogger.logError()
  ├── Supabase log_errors   (sin cambios)
  └── Sentry.captureException()   ← nuevo, server-side only
        tags: codigo, modulo, metodo, severity, empresa_id
```

```
logClientError()
  ├── console.error en dev   (sin cambios)
  └── Sentry.captureException()   ← nuevo, captura en producción
        tags: codigo, modulo, metodo
```

## Session Replay — Configuración de privacidad

```ts
replaysSessionSampleRate: 0,       // sin grabación continua
replaysOnErrorSampleRate: 1.0,     // graba solo cuando hay error

replayIntegration({
  maskAllText: true,     // OBLIGATORIO — el TPV y la carta manejan datos de clientes
  blockAllMedia: true,   // OBLIGATORIO — evita capturar imágenes de productos
})
```

`maskAllText` y `blockAllMedia` son obligatorios. El sistema es multi-tenant con datos de pedidos, importes y nombres de clientes de terceros.

## Error pages de Next.js

| Archivo | Scope | Notas |
|---|---|---|
| `src/app/error.tsx` | Todas las rutas | UI de recuperación con botón "Intentar de nuevo" |
| `src/app/global-error.tsx` | Root layout | Incluye `<html><body>` propios — no puede usar CSS variables del tema |
| `src/app/tpv/error.tsx` | Rutas `/tpv/*` | Mensaje específico para cajeros |

**No agregar `Sentry.captureException()` manualmente en estos componentes.** `withSentryConfig` los instrumenta automáticamente en el build. Añadirlo duplicaría los eventos en el dashboard.

## Source Maps

`withSentryConfig()` en `next.config.mjs` sube los source maps a Sentry en cada build usando `SENTRY_AUTH_TOKEN`. Los mapas **no se sirven públicamente** — solo van a Sentry.

## Variables de entorno

| Variable | Donde | Uso |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Runtime (Production + Preview + Development) | SDK init en browser y server |
| `SENTRY_AUTH_TOKEN` | Build only | Subida de source maps |
| `SENTRY_ORG` | Build only | Slug de la organización en Sentry |
| `SENTRY_PROJECT` | Build only | Slug del proyecto en Sentry |

`NEXT_PUBLIC_SENTRY_DSN` se incrusta en el bundle del cliente en build time (prefijo `NEXT_PUBLIC_`). No requiere configuración de "runtime" adicional.

## Alertas

Configurada en el dashboard de Sentry: **>10 ocurrencias del mismo error único en 1 minuto**.

## CSP

Se agregó `https://*.sentry.io` a `connect-src` en dos lugares:
- `next.config.mjs` — CSP fallback para assets estáticos
- `src/proxy.ts` — CSP por request con nonce (la que el browser realmente aplica)

## Límites del plan free

- Errores: 5.000/mes
- Transacciones (performance): 10.000/mes — si se alcanza, reducir `tracesSampleRate` de `1.0` a `0.1` en los tres archivos de config
- Session Replay: 500/mes (solo on-error, no continuo)

## Archivos clave

```
sentry.client.config.ts
sentry.server.config.ts
sentry.edge.config.ts
instrumentation.ts
src/components/sentry-provider.tsx
src/app/error.tsx
src/app/global-error.tsx
src/app/tpv/error.tsx
src/core/infrastructure/logging/logger.ts      (logError — double-channel)
src/lib/client-error.ts                        (logClientError — Sentry en producción)
src/app/layout.tsx                             (Sentry.setTag + SentryProvider)
```
