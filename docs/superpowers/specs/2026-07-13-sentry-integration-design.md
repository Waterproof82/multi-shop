# Sentry Integration Design

**Date:** 2026-07-13
**Status:** Approved (rev 2 — post external review)

## Context

The app has a custom `ErrorLogger` singleton that writes business errors to a Supabase `log_errors` table (server-side only). Client-side errors are silently lost in production — `logClientError` only logs to console in dev, and `ErrorBoundary.componentDidCatch` calls a logger that has no Supabase access from the browser. There is no external monitoring, no source map resolution, no alerting, and no performance tracking.

## Goal

Add Sentry as a second error channel that covers what Supabase cannot: browser crashes, unhandled promise rejections, readable stack traces in production (via source maps), performance monitoring, session replay on errors, and real-time alerts.

The Supabase `log_errors` table stays unchanged — it holds business-domain errors with `empresa_id`/`modulo` context. Sentry is the technical observability layer.

## Approach: Sentry as second channel in ErrorLogger

Every error that passes through the existing `ErrorLogger.logError()` is also forwarded to `Sentry.captureException()` with tenant context as tags. No call sites change. Client-side errors are fixed by making `logClientError` also call Sentry directly.

## Architecture

### New files

```
sentry.client.config.ts          Browser SDK init: errors, replay, Web Vitals
sentry.server.config.ts          Node.js SDK init: API routes, SSR
sentry.edge.config.ts            Edge runtime init: middleware/proxy
instrumentation.ts               Next.js entry point — imports server/edge configs only
src/components/sentry-provider.tsx   Client component that sets empresa_id tag on mount
src/app/error.tsx                Next.js error boundary UI for all routes (no manual captureException)
src/app/global-error.tsx         Next.js error boundary UI for root layout
src/app/tpv/error.tsx            Error boundary UI scoped to TPV routes
```

### Modified files

```
next.config.js / next.config.ts          Wrapped with withSentryConfig() for source maps
src/core/infrastructure/logging/logger.ts   logError() also calls Sentry.captureException()
src/lib/client-error.ts                   logClientError() also calls Sentry.captureException()
src/app/layout.tsx                        Calls Sentry.setTag(empresa_id) + renders SentryProvider
.env / .env.local                         New Sentry env vars
```

### Data flow

```
Error occurs (server or client)
  |
  +-- Existing path: ErrorLogger.logError() --> Supabase log_errors (unchanged)
  |
  +-- New path: Sentry.captureException()
        |
        +--> tags: empresa_id, modulo, severity, metodo
        +--> Sentry dashboard: stack trace (source-mapped), session, context
        +--> Alert: >10 occurrences of same error in 1 minute
```

### Multi-tenant context — server side

`instrumentation.ts` / `register()` runs ONCE at server startup — it is NOT per-request.
Tenant context must be injected per-request, not in register().

Correct approach: in the root layout server component (`src/app/layout.tsx`), which already
resolves the tenant via `parseMainDomain(domain)`, call `Sentry.setTag('empresa_id', empresaId)`
immediately after resolution. Because Next.js uses AsyncLocalStorage under the hood for Sentry
server context, any error thrown downstream in that render tree (Server Components, API routes
triggered by that request) inherits the tag automatically.

API routes that need tenant context can use the same helper via a shared utility called at the
top of the route handler.

### Multi-tenant context — client side

When an error fires in the browser, Sentry dispatches immediately. If empresa_id is not set
in the client Sentry scope, the event arrives without tenant context.

Solution: `SentryProvider` — a lightweight `"use client"` component rendered in the root layout.
It receives `empresaId` as a prop from the server component and calls `Sentry.setTag('empresa_id',
empresaId)` inside a `useEffect` that runs once on mount. All subsequent client-side Sentry events
carry the tag for the lifetime of the session.

```
src/app/layout.tsx (server)
  └── resolves empresaId via parseMainDomain()
  └── <SentryProvider empresaId={empresaId} />   ← new client component
        └── useEffect → Sentry.setTag('empresa_id', empresaId)
```

### Error pages

Three `error.tsx` files are added — one at root (`src/app/`), one for TPV (`src/app/tpv/`),
and `global-error.tsx` at root. These are client components with `"use client"` that receive
`error` and `reset` props from Next.js and show a recovery UI.

**No manual `Sentry.captureException()` inside these components.** The `@sentry/nextjs` SDK
wraps error boundaries automatically at compile time via `withSentryConfig`. Adding a manual
`captureException` in a `useEffect` would cause duplicate events in the Sentry dashboard.

If after deploying an error page is NOT captured automatically, verify `withSentryConfig` is
applied correctly before adding any manual capture.

### Source maps

`withSentryConfig()` in `next.config` uploads source maps to Sentry during every build using
`SENTRY_AUTH_TOKEN`. The maps are NOT served publicly. Stack traces in production will point
to the original TypeScript source lines.

### Session Replay

Enabled in `sentry.client.config.ts`:

```ts
replaysSessionSampleRate: 0,       // no continuous recording (free tier)
replaysOnErrorSampleRate: 1.0,     // record only when an error occurs

integrations: [
  Sentry.replayIntegration({
    maskAllText: true,     // mask all text — PII protection for multi-tenant
    blockAllMedia: true,   // block images/video — avoids capturing product photos or sensitive media
  }),
],
```

`maskAllText: true` and `blockAllMedia: true` are mandatory. The TPV and client menu handle
amounts, customer names, and order details — capturing these in replays would be a PII violation
for the tenants' end customers.

## Environment Variables

| Variable | Runtime | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | client + server | SDK init |
| `SENTRY_AUTH_TOKEN` | build only | Source map upload |
| `SENTRY_ORG` | build only | Sentry organization slug |
| `SENTRY_PROJECT` | build only | Sentry project slug |

`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are Vercel build-environment-only
variables — not exposed at runtime.

## Alerting

Single alert configured in Sentry: **>10 occurrences of the same unique error in 1 minute**.
Can be refined once real traffic data is available.

## Out of scope

- Replacing Supabase `log_errors` with Sentry (log_errors has business value per tenant)
- Performance transactions for individual DB queries (too granular for now)
- Custom Sentry dashboards
- User feedback widget

## Sentry SDK version

`@sentry/nextjs` — official Next.js SDK, supports App Router, edge runtime, and source maps
via `withSentryConfig`.
