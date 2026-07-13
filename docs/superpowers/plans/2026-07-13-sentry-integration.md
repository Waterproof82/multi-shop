# Sentry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry as a second error channel alongside the existing Supabase `log_errors` system, covering client-side crashes, source-mapped stack traces, performance monitoring, session replay on error, and real-time alerting.

**Architecture:** Three Sentry config files (client/server/edge) initialize the SDK per runtime. The existing `ErrorLogger.logError()` forwards server errors to Sentry after writing to Supabase. Client errors go to Sentry via `logClientError()`. Tenant context is injected server-side in `layout.tsx` and client-side via a `SentryProvider` component.

**Tech Stack:** `@sentry/nextjs`, Next.js 16 App Router, React 19, ESM (`next.config.mjs`)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `sentry.client.config.ts` | Create | Browser SDK init: errors, replay, Web Vitals |
| `sentry.server.config.ts` | Create | Node.js SDK init: API routes, SSR |
| `sentry.edge.config.ts` | Create | Edge runtime init: middleware/proxy |
| `instrumentation.ts` | Create | Next.js entry point — lazy-imports server/edge configs |
| `src/components/sentry-provider.tsx` | Create | Client component: sets empresa_id tag on mount |
| `src/app/error.tsx` | Create | Route-level error boundary UI |
| `src/app/global-error.tsx` | Create | Root layout error boundary UI |
| `src/app/tpv/error.tsx` | Create | TPV-scoped error boundary UI |
| `next.config.mjs` | Modify | Wrap with `withSentryConfig` for source maps |
| `src/proxy.ts` | Modify | Add `https://*.sentry.io` to CSP `connect-src` |
| `src/core/infrastructure/logging/logger.ts` | Modify | Forward server errors to Sentry |
| `src/lib/client-error.ts` | Modify | Forward client errors to Sentry |
| `src/app/layout.tsx` | Modify | Set server Sentry tag + render SentryProvider |
| `.env` / `.env.local` | Modify | Add Sentry env vars |

---

### Task 1: Install @sentry/nextjs and add environment variables

**Files:**
- Modify: `.env`
- Modify: `.env.local`

- [ ] **Step 1: Install the package**

```bash
pnpm add @sentry/nextjs
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Add env vars to `.env` and `.env.local`**

Add these lines to **both** `.env` and `.env.local`:

```bash
# Sentry — obtener desde https://sentry.io → Settings → Projects → Client Keys
NEXT_PUBLIC_SENTRY_DSN=https://<your-key>@o<org-id>.ingest.sentry.io/<project-id>

# Solo para build (subida de source maps). NO va a producción como var de runtime.
SENTRY_AUTH_TOKEN=<your-auth-token>
SENTRY_ORG=<your-org-slug>
SENTRY_PROJECT=<your-project-slug>
```

`SENTRY_AUTH_TOKEN` se obtiene en Sentry → Settings → Auth Tokens → Create New Token (scope: `project:releases`, `org:read`).

`SENTRY_ORG` y `SENTRY_PROJECT` son los slugs que aparecen en la URL de Sentry: `https://sentry.io/organizations/<SENTRY_ORG>/projects/<SENTRY_PROJECT>/`.

En Vercel, agregar `NEXT_PUBLIC_SENTRY_DSN` como variable de runtime (Production + Preview) y las otras tres como variables de Build únicamente.

- [ ] **Step 3: Commit**

```bash
git add .env .env.local
git commit -m "chore(sentry): add Sentry environment variables"
```

---

### Task 2: Create Sentry config files and instrumentation.ts

**Files:**
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `instrumentation.ts`

- [ ] **Step 1: Create `sentry.client.config.ts` in the project root**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
```

`maskAllText` y `blockAllMedia` son obligatorios — el TPV y la carta manejan importes, nombres y pedidos de clientes de los tenants.

- [ ] **Step 2: Create `sentry.server.config.ts` in the project root**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

- [ ] **Step 3: Create `sentry.edge.config.ts` in the project root**

```ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

- [ ] **Step 4: Create `instrumentation.ts` in the project root**

`register()` runs ONCE at server startup. It does NOT run per-request. Only use it to import the SDK init files.

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add sentry.client.config.ts sentry.server.config.ts sentry.edge.config.ts instrumentation.ts
git commit -m "feat(sentry): add SDK init configs and instrumentation entry point"
```

---

### Task 3: Wrap next.config.mjs with withSentryConfig + update CSP

**Files:**
- Modify: `next.config.mjs`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add `withSentryConfig` import to `next.config.mjs`**

Add this import at the top of `next.config.mjs`, after the existing imports:

```mjs
import { withSentryConfig } from '@sentry/nextjs';
```

- [ ] **Step 2: Replace `export default nextConfig` at the bottom of `next.config.mjs`**

Current last line:
```mjs
export default nextConfig
```

Replace with:
```mjs
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silent during local builds; verbose in CI
  silent: !process.env.CI,
  // Upload all source files for better stack traces
  widenClientFileUpload: true,
  // Do NOT serve source maps publicly
  hideSourceMaps: true,
  // Suppress Sentry SDK bundle size logs
  disableLogger: true,
});
```

- [ ] **Step 3: Add `https://*.sentry.io` to `connect-src` in `next.config.mjs`**

Find the `connect-src` line in the `cspFallback` array:

```mjs
"connect-src 'self' https://*.supabase.co https://api.brevo.com https://*.upstash.io",
```

Replace with:

```mjs
"connect-src 'self' https://*.supabase.co https://api.brevo.com https://*.upstash.io https://*.sentry.io",
```

- [ ] **Step 4: Add `https://*.sentry.io` to `connect-src` in `src/proxy.ts`**

Find the `connect-src` line in `buildCsp()` in `src/proxy.ts` (around line 233):

```ts
`connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.brevo.com https://*.upstash.io https://api.mapbox.com https://events.mapbox.com${connectR2}${devConnectSrc}`,
```

Replace with:

```ts
`connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.brevo.com https://*.upstash.io https://api.mapbox.com https://events.mapbox.com https://*.sentry.io${connectR2}${devConnectSrc}`,
```

- [ ] **Step 5: Verify the build still passes**

```bash
pnpm build
```

Expected: build succeeds. Sentry webpack plugin runs and logs source map upload (or silently skips if `SENTRY_AUTH_TOKEN` is not set locally).

- [ ] **Step 6: Commit**

```bash
git add next.config.mjs src/proxy.ts
git commit -m "feat(sentry): wrap next.config with withSentryConfig, update CSP connect-src"
```

---

### Task 4: Create SentryProvider client component

**Files:**
- Create: `src/components/sentry-provider.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface SentryProviderProps {
  empresaId: string | null;
}

export function SentryProvider({ empresaId }: Readonly<SentryProviderProps>) {
  useEffect(() => {
    if (empresaId) {
      Sentry.setTag('empresa_id', empresaId);
    }
  }, [empresaId]);

  return null;
}
```

This sets `empresa_id` as a permanent tag on the browser Sentry scope. All client-side errors captured after mount carry this tag automatically.

- [ ] **Step 2: Commit**

```bash
git add src/components/sentry-provider.tsx
git commit -m "feat(sentry): add SentryProvider to inject tenant tag on client scope"
```

---

### Task 5: Update root layout to set server Sentry tag and render SentryProvider

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add Sentry import to `src/app/layout.tsx`**

Add after the existing imports:

```ts
import * as Sentry from '@sentry/nextjs';
import { SentryProvider } from '@/components/sentry-provider';
```

- [ ] **Step 2: Set the server-side Sentry tag**

In `RootLayout`, after `const empresa = domain ? await getEmpresaByDomain(domain) : null;` add:

```ts
// Set tenant tag on the Sentry server scope for this request.
// AsyncLocalStorage propagates this tag to all errors thrown in this render tree.
if (empresa?.id) {
  Sentry.setTag('empresa_id', empresa.id);
}
```

- [ ] **Step 3: Render SentryProvider inside the layout JSX**

Inside the `<body>` tag, add `<SentryProvider>` immediately before `</body>` (after `<SwRegistrar />`):

```tsx
<SwRegistrar />
<SentryProvider empresaId={empresa?.id ?? null} />
```

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(sentry): inject empresa_id tag in root layout for server and client scopes"
```

---

### Task 6: Update ErrorLogger to forward server errors to Sentry

**Files:**
- Modify: `src/core/infrastructure/logging/logger.ts`

- [ ] **Step 1: Add Sentry forwarding inside `logError()`**

In `src/core/infrastructure/logging/logger.ts`, update the `logError` method. After the existing Supabase write (and the console fallback block), add:

```ts
async logError(data: LogErrorData): Promise<void> {
  if (this.repository) {
    try {
      await this.repository.log(data);
    } catch (e) {
      console.error('[ERROR_LOGGER_FAILED]', e);
    }
  } else {
    // Fallback to console logging when Supabase is not available
    console.error('[ERROR_LOG]', {
      codigo: data.codigo,
      mensaje: data.mensaje,
      modulo: data.modulo,
      severity: data.severity,
      metadata: data.metadata,
    });
  }

  // Forward to Sentry (server-side only — client errors go via logClientError)
  if (globalThis.window === undefined) {
    const { captureException } = await import('@sentry/nextjs');
    captureException(new Error(data.mensaje), {
      tags: {
        codigo: data.codigo,
        modulo: data.modulo,
        metodo: data.metodo ?? 'unknown',
        severity: data.severity ?? 'error',
        ...(data.empresaId ? { empresa_id: data.empresaId } : {}),
      },
      extra: (data.metadata ?? {}) as Record<string, unknown>,
    });
  }
}
```

The `globalThis.window === undefined` guard ensures this only runs server-side. The dynamic import avoids bundling Sentry into paths that don't need it.

- [ ] **Step 2: Commit**

```bash
git add src/core/infrastructure/logging/logger.ts
git commit -m "feat(sentry): forward server-side ErrorLogger errors to Sentry"
```

---

### Task 7: Update client-error.ts to forward client errors to Sentry

**Files:**
- Modify: `src/lib/client-error.ts`

- [ ] **Step 1: Add Sentry import and forwarding to `logClientError`**

Replace the entire content of `src/lib/client-error.ts` with:

```ts
import { AppError, ErrorModule } from '@/core/domain/entities/types';
import * as Sentry from '@sentry/nextjs';

/**
 * Client-safe error handler for React components
 * Uses Result pattern and safe console logging
 */

type ClientErrorModule = Exclude<ErrorModule, 'repository'>;

function createClientError(
  code: string,
  message: string,
  method: string,
  module: ClientErrorModule = 'use-case',
): AppError {
  return {
    code,
    message,
    module,
    method,
    severity: 'error',
  };
}

function safeLogError(error: AppError): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${error.module}:${error.method}] ${error.code}: ${error.message}`, error.details);
  }
}

export function logClientError(
  error: unknown,
  method: string,
  module: ClientErrorModule = 'use-case',
): AppError {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const appError = createClientError('CLIENT_ERROR', message, method, module);
  safeLogError(appError);

  // Forward to Sentry — captures client errors in production (previously silent)
  Sentry.captureException(error instanceof Error ? error : new Error(message), {
    tags: {
      codigo: 'CLIENT_ERROR',
      modulo: module,
      metodo: method,
    },
  });

  return appError;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/client-error.ts
git commit -m "feat(sentry): forward client-side errors to Sentry in logClientError"
```

---

### Task 8: Add Next.js error boundary pages

**Files:**
- Create: `src/app/error.tsx`
- Create: `src/app/global-error.tsx`
- Create: `src/app/tpv/error.tsx`

**Important:** Do NOT add `Sentry.captureException()` manually inside these components. `withSentryConfig` automatically instruments error boundaries at compile time. Manual `captureException` would duplicate events in the Sentry dashboard.

- [ ] **Step 1: Create `src/app/error.tsx`**

```tsx
'use client';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ reset }: Readonly<ErrorPageProps>) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
      <div className="mb-4 text-4xl" role="img" aria-label="Error">⚠️</div>
      <h2 className="mb-2 text-lg font-semibold text-destructive">
        Algo salió mal
      </h2>
      <p className="mb-4 text-sm text-muted-foreground max-w-md">
        Ha ocurrido un error inesperado. Por favor, intentá de nuevo o recargá la página.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/global-error.tsx`**

`global-error.tsx` replaces the entire root layout on crash, so it must include its own `<html>` and `<body>`. Cannot use CSS variables from the theme — use plain Tailwind.

```tsx
'use client';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ reset }: Readonly<GlobalErrorProps>) {
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 text-4xl" role="img" aria-label="Error crítico">⚠️</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            Error crítico
          </h1>
          <p className="mb-4 text-sm text-gray-600 max-w-md">
            La aplicación ha encontrado un error grave. Por favor, recargá la página.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `src/app/tpv/error.tsx`**

Same as `error.tsx` — scoped to TPV routes. Cashiers get a recovery UI instead of a blank screen.

```tsx
'use client';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TpvError({ reset }: Readonly<ErrorPageProps>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
      <div className="mb-4 text-4xl" role="img" aria-label="Error en TPV">⚠️</div>
      <h2 className="mb-2 text-lg font-semibold text-destructive">
        Error en el TPV
      </h2>
      <p className="mb-4 text-sm text-muted-foreground max-w-md">
        Ha ocurrido un error inesperado. El error ha sido reportado automáticamente.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/error.tsx src/app/global-error.tsx src/app/tpv/error.tsx
git commit -m "feat(sentry): add Next.js error boundary pages for route and TPV recovery"
```

---

## Verification checklist

After all tasks are complete:

- [ ] `pnpm lint` passes with no errors
- [ ] `pnpm build` passes and Sentry webpack plugin logs source map upload
- [ ] In Sentry dashboard → Project → Source Maps: at least one release with maps uploaded
- [ ] Throw a test error in a server component, verify it appears in Sentry with `empresa_id` tag
- [ ] Throw a test error in a client component, verify it appears in Sentry with `empresa_id` tag
- [ ] Trigger a render error to test `error.tsx` — verify Sentry catches it (no manual `captureException` needed)
- [ ] Remove any test errors before merging

## Notes

- `tracesSampleRate: 1.0` is fine for low traffic. Reduce to `0.1` in production if transactions quota becomes an issue (Sentry free: 10k transactions/month).
- The alert (>10 occurrences/min) was configured in the Sentry dashboard during project setup.
- If Sentry does NOT auto-capture errors from `error.tsx` after deploying, verify `withSentryConfig` is applied in `next.config.mjs` before adding any manual `captureException`.
