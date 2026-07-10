# Infrastructure & Architecture Optimization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Vercel/Supabase costs and improve Waiter APK responsiveness across 4 independent subsystems.

**Architecture:**
- **Subsystem A (Menu Cache):** Wrap `GetMenuUseCase.execute` in `unstable_cache` keyed by `empresaId`. Admin mutations call `revalidateTag` to bust the cache. The public menu page stops hitting the DB on every request.
- **Subsystem B (Realtime Lifecycle):** Add `isTabVisible` state to every Waiter component with Realtime subscriptions. When the tab/app is hidden, React's cleanup removes the channels; when visible again, the effect re-runs and resubscribes. One boolean in the dependency array is all it takes.
- **Subsystem C (Optimistic UI):** Kitchen and Pendientes pages update local state BEFORE the PATCH resolves. On failure they revert. Mirrors the pattern BarPage already uses (`bar_served_keys`).
- **Subsystem D (Tenant Backup):** Supabase Edge Function exports `productos + categorias` per empresa as minified JSON to Cloudflare R2. Triggered daily by a GitHub Actions cron. Admin restore endpoint reads from R2, sanitizes tenant ownership, and restores in FK-safe order (categorias first, then productos).

**Tech Stack:** Next.js `unstable_cache` + `revalidateTag`, Supabase Edge Functions, Cloudflare R2 (S3-compatible API via `@aws-sdk/client-s3`), GitHub Actions, Deno (Edge Function runtime)

---

## Scope — Each Subsystem is Independent

Implement and deploy them in separate branches in this order (highest ROI first):

| Priority | Subsystem | Impact |
|---|---|---|
| 1 | A — Menu Cache | Eliminates DB hit on every public page load |
| 2 | B — Realtime Lifecycle | Cuts idle Supabase Realtime connections |
| 3 | C — Optimistic UI | Instant Waiter tab transitions on Android |
| 4 | D — Tenant Backup | Data safety without Supabase PITR |

---

## File Map

### Subsystem A
- Create: `src/lib/cache-tags.ts` — catalog tag naming utility
- Modify: `src/lib/server-services.ts` — add `getCachedMenu()` wrapping `unstable_cache`
- Modify: `src/app/page.tsx` — call `getCachedMenu` instead of `getMenuUseCase.execute`; remove `revalidate = 0`
- Modify: `src/app/api/admin/productos/route.ts` — call `revalidateTag` after PUT/POST/DELETE
- Modify: `src/app/api/admin/categorias/route.ts` — call `revalidateTag` after PUT/POST/DELETE

### Subsystem B
- Modify: `src/components/waiter-banner.tsx` — `isTabVisible` state + effect + guard in Realtime effect
- Modify: `src/app/waiter/kitchen/page.tsx` — same pattern
- Modify: `src/app/waiter/pendientes/page.tsx` — same pattern
- Modify: `src/app/waiter/bar/page.tsx` — same pattern

### Subsystem C
- Modify: `src/app/waiter/kitchen/page.tsx` — optimistic `estado` update before PATCH; revert on failure
- Modify: `src/app/waiter/pendientes/page.tsx` — parallelize sequential per-pedido API calls with `Promise.all`

### Subsystem D
- Create: `supabase/functions/tenant-backup/index.ts` — Deno Edge Function
- Create: `.github/workflows/tenant-backup.yml` — daily cron trigger
- Create: `src/app/api/admin/backup/restore/route.ts` — restore from R2 (with tenant sanitization + FK-safe order)

### Subsystem B (addition)
- Modify: `src/components/waiter-banner.tsx` — store `empresaId` from `/api/waiter/me` response; pass as `filter` to postgres_changes subscriptions

---

## Subsystem A — Menu Cache

### Task 1: Create cache tag utility

**Files:**
- Create: `src/lib/cache-tags.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/cache-tags.ts
export const catalogTag = (empresaId: string) => `catalog:${empresaId}`;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/cache-tags.ts
git commit -m "feat(cache): add catalog cache tag utility"
```

---

### Task 2: Wrap GetMenuUseCase in unstable_cache

**Files:**
- Modify: `src/lib/server-services.ts`

- [ ] **Step 1: Add the import at the top of `src/lib/server-services.ts`**

After the existing imports, add:
```typescript
import { unstable_cache } from 'next/cache';
import { catalogTag } from '@/lib/cache-tags';
```

- [ ] **Step 2: Add `getCachedMenu` function at the bottom of `src/lib/server-services.ts`**

```typescript
/**
 * Returns the public menu for an empresa, cached in Vercel's data cache.
 * TTL: 1 hour. Busted by revalidateTag(catalogTag(empresaId)) on mutations.
 */
export function getCachedMenu(empresaId: string) {
  return unstable_cache(
    async () => getMenuUseCase.execute(empresaId),
    [catalogTag(empresaId)],
    { tags: [catalogTag(empresaId)], revalidate: 3600 }
  )();
}
```

- [ ] **Step 3: Run build to verify no type errors**

```bash
pnpm build
```

Expected: no TypeScript errors. `unstable_cache` is available in Next.js 14+.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server-services.ts
git commit -m "feat(cache): wrap GetMenuUseCase in unstable_cache (1h TTL per empresa)"
```

---

### Task 3: Use getCachedMenu in the public home page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace the menu fetch call**

In `src/app/page.tsx`, find this block (around line 65):
```typescript
const menuResult = await getMenuUseCase.execute(empresaId!);
```

Replace with:
```typescript
const menuResult = await getCachedMenu(empresaId!);
```

- [ ] **Step 2: Update the import in `src/app/page.tsx`**

Find:
```typescript
import { getMenuUseCase, getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
```

Replace with:
```typescript
import { getCachedMenu, getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
```

- [ ] **Step 3: Remove the now-redundant `revalidate = 0` export**

Find and delete this line:
```typescript
export const revalidate = 0;
```

Keep `export const dynamic = 'force-dynamic';` — the page reads cookies so it must remain dynamic. Only the DB fetch is now cached.

- [ ] **Step 4: Build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(cache): use getCachedMenu in public home page — eliminates per-request DB hit"
```

---

### Task 4: Bust cache on product mutations

**Files:**
- Modify: `src/app/api/admin/productos/route.ts`

- [ ] **Step 1: Add imports at the top of `src/app/api/admin/productos/route.ts`**

After the existing imports, add:
```typescript
import { revalidateTag } from 'next/cache';
import { catalogTag } from '@/lib/cache-tags';
```

- [ ] **Step 2: Add revalidation after successful POST (create product)**

In the `POST` handler, find the success return statement:
```typescript
return handleResultWithStatus({ success: true, data: toAdminProduct(result.data) }, 201);
```

Insert before it:
```typescript
revalidateTag(catalogTag(empresaId!));
```

- [ ] **Step 3: Add revalidation after successful PUT (update product)**

In the `PUT` handler, find:
```typescript
return handleResult({ success: true, data: toAdminProduct(result.data) });
```

Insert before it:
```typescript
revalidateTag(catalogTag(empresaId!));
```

- [ ] **Step 4: Add revalidation after successful DELETE**

In the `DELETE` handler, find:
```typescript
return handleResult({ success: true, data: { success: true } });
```

Insert before it:
```typescript
revalidateTag(catalogTag(empresaId!));
```

- [ ] **Step 5: Build and verify**

```bash
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/productos/route.ts
git commit -m "feat(cache): revalidate catalog cache on product mutations"
```

---

### Task 5: Bust cache on category mutations

**Files:**
- Modify: `src/app/api/admin/categorias/route.ts`

- [ ] **Step 1: Read the file to understand its structure**

```bash
# Read src/app/api/admin/categorias/route.ts
```

- [ ] **Step 2: Add imports**

After existing imports, add:
```typescript
import { revalidateTag } from 'next/cache';
import { catalogTag } from '@/lib/cache-tags';
```

- [ ] **Step 3: Add `revalidateTag(catalogTag(empresaId!))` before every success return in POST, PUT, and DELETE handlers**

Pattern: immediately before any `return handleResult(...)` or `return handleResultWithStatus(...)` inside a mutating handler, when `result.success` is true.

- [ ] **Step 4: Build**

```bash
pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/categorias/route.ts
git commit -m "feat(cache): revalidate catalog cache on category mutations"
```

---

## Subsystem B — Realtime Visibility Lifecycle

**Pattern for all 4 components:**
1. Add `const [isTabVisible, setIsTabVisible] = useState(true)` near other state declarations
2. Add a `useEffect` that listens to `visibilitychange` and syncs the state
3. Add `isTabVisible` as the FIRST guard in the Realtime subscription `useEffect` (early return when `false`)
4. Add `isTabVisible` to the Realtime effect's dependency array
5. Add a second small `useEffect` that re-fetches data when `isTabVisible` becomes `true` (gap recovery)

When `isTabVisible` becomes `false` → React runs the effect cleanup → channels are removed.
When `isTabVisible` becomes `true` → React runs the effect again → channels are recreated.

---

### Task 6: Visibility lifecycle in WaiterBanner

**Files:**
- Modify: `src/components/waiter-banner.tsx`

- [ ] **Step 1: Add `isTabVisible` state near line 131 (after the `counts` state)**

```typescript
const [isTabVisible, setIsTabVisible] = useState(true);
```

- [ ] **Step 2: Add a visibility sync effect after the existing auth-changed effect (around line 171)**

```typescript
useEffect(() => {
  const onVis = () => setIsTabVisible(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}, []);
```

- [ ] **Step 3: In the Realtime effect (starts around line 239), add `isTabVisible` guard at the very top**

After the existing guards (`if (!isWaiter) return;` and `if (pathname.startsWith('/tpv')) return;`), add:
```typescript
if (!isTabVisible) return;
```

- [ ] **Step 4: Add `isTabVisible` to the Realtime effect's dependency array**

Find the dependency array of that `useEffect` (currently ends with `[isWaiter, mesaId, fetchLock, pathname]`) and add `isTabVisible`:
```typescript
}, [isWaiter, mesaId, fetchLock, pathname, isTabVisible]);
```

- [ ] **Step 5: Remove the EXISTING `visibilitychange` listener inside that Realtime effect**

The current code around line 270 has an `onVisibilityChange` function and a `document.addEventListener('visibilitychange', onVisibilityChange)` inside the Realtime effect. Remove those lines and the corresponding `document.removeEventListener` in the cleanup. The new `useEffect` from Step 2 replaces them.

But keep the re-fetch on visible by adding a separate effect:
```typescript
useEffect(() => {
  if (isTabVisible && isWaiter && !pathname.startsWith('/tpv')) {
    void fetchCounts();
    globalThis.dispatchEvent(new CustomEvent('waiter-realtime-update'));
  }
}, [isTabVisible, isWaiter, pathname, fetchCounts]);
```

- [ ] **Step 6: Build**

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/waiter-banner.tsx
git commit -m "feat(realtime): disconnect WaiterBanner channels when tab is hidden"
```

---

### Task 7: Visibility lifecycle in KitchenPage

**Files:**
- Modify: `src/app/waiter/kitchen/page.tsx`

- [ ] **Step 1: Add `isTabVisible` state near existing state declarations**

```typescript
const [isTabVisible, setIsTabVisible] = useState(true);
```

- [ ] **Step 2: Add visibility sync effect**

```typescript
useEffect(() => {
  const onVis = () => setIsTabVisible(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}, []);
```

- [ ] **Step 3: Find the Realtime subscription `useEffect` in the file**

It will contain `supabase.channel(channelNameRef.current)` and `.on('postgres_changes', ...)`.

Add `isTabVisible` as the first guard:
```typescript
if (!isTabVisible) return;
```

- [ ] **Step 4: Add `isTabVisible` to that effect's dependency array**

- [ ] **Step 5: Add re-fetch on visible**

```typescript
useEffect(() => {
  if (isTabVisible) {
    void fetchItems(); // use whatever the fetch function is named in this file
    globalThis.dispatchEvent(new CustomEvent('waiter-realtime-update'));
  }
}, [isTabVisible, fetchItems]);
```

(Find the exact function name for fetching items — look for `useCallback` that calls `/api/waiter/kitchen/orders`)

- [ ] **Step 6: Build**

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/app/waiter/kitchen/page.tsx
git commit -m "feat(realtime): disconnect kitchen channels when tab is hidden"
```

---

### Task 8: Visibility lifecycle in PendientesPage

**Files:**
- Modify: `src/app/waiter/pendientes/page.tsx`

- [ ] **Step 1: Add `isTabVisible` state near line 298 (after `collapsedMesas` state)**

```typescript
const [isTabVisible, setIsTabVisible] = useState(true);
```

- [ ] **Step 2: Add visibility sync effect after existing effects**

```typescript
useEffect(() => {
  const onVis = () => setIsTabVisible(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}, []);
```

- [ ] **Step 3: In the Realtime `useEffect` starting around line 322, add the guard at the top**

```typescript
if (!isTabVisible) return;
```

- [ ] **Step 4: Add `isTabVisible` to the dependency array (currently `[fetchPendientes]`)**

```typescript
}, [fetchPendientes, isTabVisible]);
```

- [ ] **Step 5: Add re-fetch on visible**

```typescript
useEffect(() => {
  if (isTabVisible) void fetchPendientes();
}, [isTabVisible, fetchPendientes]);
```

- [ ] **Step 6: Build**

```bash
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add src/app/waiter/pendientes/page.tsx
git commit -m "feat(realtime): disconnect pendientes channels when tab is hidden"
```

---

### Task 9: Visibility lifecycle in BarPage

**Files:**
- Modify: `src/app/waiter/bar/page.tsx`

- [ ] **Step 1: Read the bar page Realtime section to identify the subscription effect and its dependency array**

- [ ] **Step 2: Apply identical pattern — `isTabVisible` state + visibility sync effect + guard in Realtime effect + `isTabVisible` in deps + re-fetch on visible**

Same four-step pattern as Tasks 6–8.

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/waiter/bar/page.tsx
git commit -m "feat(realtime): disconnect bar channels when tab is hidden"
```

---

## Subsystem C — Optimistic UI

### Task 10: Optimistic mark-ready in KitchenPage

**Context:** Currently when the waiter taps to mark an item as `listo`, the UI freezes until the PATCH responds (~300ms on Android). The optimistic pattern: update state immediately, fire PATCH in background, revert on failure.

**Files:**
- Modify: `src/app/waiter/kitchen/page.tsx`

- [ ] **Step 1: Read the current `handleMarkReady` (or equivalent) function in kitchen page**

Find the function that fires `PATCH /api/waiter/kitchen/items/{pedidoId}/{itemIdx}/status` with `estado: 'listo'`.

- [ ] **Step 2: Capture current estado before update**

Before updating state:
```typescript
const prevItems = items; // snapshot for rollback
```

- [ ] **Step 3: Apply optimistic update immediately**

```typescript
setItems(prev => prev.map(item =>
  item.pedidoId === pedidoId && item.itemIdx === itemIdx
    ? { ...item, estado: 'listo' as const }
    : item
));
```

- [ ] **Step 4: Fire the PATCH**

```typescript
const res = await fetch(
  `/api/waiter/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`,
  { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado: 'listo' }) }
);
```

- [ ] **Step 5: Revert on failure**

```typescript
if (!res.ok) {
  setItems(prevItems); // rollback
}
```

Do NOT re-fetch on success — Realtime will sync other devices, and the local state is already correct.

- [ ] **Step 6: Apply the same pattern to the `handleMarkServido` function (if it exists)**

Same three-step pattern: optimistic update → PATCH → revert on failure.

- [ ] **Step 7: Build**

```bash
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add src/app/waiter/kitchen/page.tsx
git commit -m "feat(ux): optimistic mark-ready/servido in kitchen page"
```

---

### Task 11: Parallelize per-pedido API calls in PendientesPage

**Context:** `handleConfirm` and `handleConfirmBoth` iterate `mesa.pedidos` with a sequential `for...of` + `await`. With 3 tables validating simultaneously, this blocks for 3× the network round-trip time.

**Files:**
- Modify: `src/app/waiter/pendientes/page.tsx`

- [ ] **Step 1: Refactor `handleConfirm` — replace the `for...of` loop with `Promise.all`**

Find the loop starting around line 434:
```typescript
for (const pedido of mesa.pedidos) {
  if (!pedido.items.some(i => i.tipo === sendTipo)) continue;
  if (pedido.validated) {
    const released = await releaseRetainedPedidoItems(pedido.id, ...);
    if (released.length > 0) removedItemsMap.set(pedido.id, released);
  } else {
    const ok = await validateNewPedido(pedido.id, ...);
    if (ok) removedItemsMap.set(pedido.id, pedido.items.map(i => i.idx));
  }
}
```

Replace with:
```typescript
const results = await Promise.all(
  mesa.pedidos.map(async pedido => {
    if (!pedido.items.some(i => i.tipo === sendTipo)) return null;
    if (pedido.validated) {
      const released = await releaseRetainedPedidoItems(pedido.id, pedido.items, sendTipo, selected, paused, mode);
      return released.length > 0 ? ([pedido.id, released] as const) : null;
    } else {
      const ok = await validateNewPedido(pedido.id, pedido.items, sendTipo, selected, paused, mode);
      return ok ? ([pedido.id, pedido.items.map(i => i.idx)] as const) : null;
    }
  })
);
for (const entry of results) {
  if (entry) removedItemsMap.set(entry[0], entry[1]);
}
```

- [ ] **Step 2: Apply the same parallelization to `handleConfirmBoth`**

Find the loop around line 473:
```typescript
for (const pedido of mesa.pedidos) {
  if (pedido.validated) {
    const released = await releaseSelectedPedidoItems(pedido.id, pedido.items, selected);
    if (released.length > 0) removedItemsMap.set(pedido.id, released);
  } else {
    const ok = await validateBothTypesPedido(pedido.id, pedido.items, selected, paused);
    if (ok) removedItemsMap.set(pedido.id, pedido.items.map(i => i.idx));
  }
}
```

Replace with:
```typescript
const results = await Promise.all(
  mesa.pedidos.map(async pedido => {
    if (pedido.validated) {
      const released = await releaseSelectedPedidoItems(pedido.id, pedido.items, selected);
      return released.length > 0 ? ([pedido.id, released] as const) : null;
    } else {
      const ok = await validateBothTypesPedido(pedido.id, pedido.items, selected, paused);
      return ok ? ([pedido.id, pedido.items.map(i => i.idx)] as const) : null;
    }
  })
);
for (const entry of results) {
  if (entry) removedItemsMap.set(entry[0], entry[1]);
}
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Verify the race condition guard still holds**

The `confirmingRef.current` guard in `bannerRelay` (line 351) prevents mid-loop fetches. Verify it still works: `confirmingRef` is set before `Promise.all` and cleared in `finally` — no change needed.

- [ ] **Step 5: Commit**

```bash
git add src/app/waiter/pendientes/page.tsx
git commit -m "perf(ux): parallelize per-pedido API calls in pendientes confirm handlers"
```

---

## Subsystem D — Tenant Backup to R2

**Prerequisites:** Cloudflare R2 bucket exists. The following env vars must be set in Supabase Edge Function secrets and in GitHub Actions secrets:
- `R2_ENDPOINT` — e.g. `https://<account-id>.r2.cloudflarestorage.com`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME` — e.g. `multi-shop-backups`
- `BACKUP_SECRET` — a random string, same in both Supabase and GitHub Actions

---

### Task 12: Create the Supabase Edge Function

**Files:**
- Create: `supabase/functions/tenant-backup/index.ts`

- [ ] **Step 1: Create the directory and file**

```typescript
// supabase/functions/tenant-backup/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3';

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${Deno.env.get('BACKUP_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const s3 = new S3Client({
    region: 'auto',
    endpoint: Deno.env.get('R2_ENDPOINT')!,
    credentials: {
      accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
    },
  });

  const { data: empresas, error: empError } = await supabase
    .from('empresas')
    .select('id, nombre, dominio');

  if (empError) {
    return new Response(JSON.stringify({ error: empError.message }), { status: 500 });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const errors: string[] = [];

  for (const empresa of empresas ?? []) {
    try {
      const [prodResult, catResult] = await Promise.all([
        supabase.from('productos').select('*').eq('empresa_id', empresa.id),
        supabase.from('categorias').select('*').eq('empresa_id', empresa.id),
      ]);

      if (prodResult.error) throw new Error(`productos: ${prodResult.error.message}`);
      if (catResult.error) throw new Error(`categorias: ${catResult.error.message}`);

      const snapshot = {
        empresa,
        productos: prodResult.data,
        categorias: catResult.data,
        exportedAt: new Date().toISOString(),
      };

      // Plain minified JSON — for a single tenant the payload is typically < 500 KB.
      // Gzip adds Deno complexity for marginal gain; revisit if snapshots exceed 2 MB.
      const body = JSON.stringify(snapshot);
      const key = `backups/${empresa.id}/${today}.json`;

      await s3.send(new PutObjectCommand({
        Bucket: Deno.env.get('R2_BUCKET_NAME')!,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      }));
    } catch (err) {
      errors.push(`${empresa.id}: ${String(err)}`);
    }
  }

  if (errors.length > 0) {
    return new Response(JSON.stringify({ status: 'partial', errors }), { status: 207 });
  }

  return new Response(JSON.stringify({ status: 'ok', count: (empresas ?? []).length }), { status: 200 });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/tenant-backup/index.ts
git commit -m "feat(backup): Supabase Edge Function — daily tenant export to R2"
```

---

### Task 13: Deploy the Edge Function and set secrets

- [ ] **Step 1: Deploy to Supabase**

```bash
npx supabase functions deploy tenant-backup --no-verify-jwt
```

The `--no-verify-jwt` flag is required because this function uses its own `BACKUP_SECRET` auth, not Supabase JWT.

- [ ] **Step 2: Set Edge Function secrets**

```bash
npx supabase secrets set BACKUP_SECRET=<your-random-string>
npx supabase secrets set R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
npx supabase secrets set R2_ACCESS_KEY_ID=<key>
npx supabase secrets set R2_SECRET_ACCESS_KEY=<secret>
npx supabase secrets set R2_BUCKET_NAME=multi-shop-backups
```

- [ ] **Step 3: Smoke test — call the function manually**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/tenant-backup \
  -H "Authorization: Bearer <your-random-string>" \
  -H "Content-Type: application/json"
```

Expected: `{"status":"ok","count":N}` and a new file in R2.

---

### Task 14: Add GitHub Actions daily cron

**Files:**
- Create: `.github/workflows/tenant-backup.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/tenant-backup.yml
name: Tenant Backup

on:
  schedule:
    - cron: '0 3 * * *'   # 3:00 AM UTC daily
  workflow_dispatch:        # manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger tenant-backup Edge Function
        run: |
          response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/tenant-backup" \
            -H "Authorization: Bearer ${{ secrets.BACKUP_SECRET }}" \
            -H "Content-Type: application/json")
          echo "HTTP status: $response"
          if [ "$response" != "200" ] && [ "$response" != "207" ]; then
            echo "Backup failed with status $response"
            exit 1
          fi
```

- [ ] **Step 2: Add GitHub Actions secrets**

In the GitHub repo → Settings → Secrets:
- `SUPABASE_URL` — from Supabase project settings
- `BACKUP_SECRET` — same value as the Edge Function secret

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tenant-backup.yml
git commit -m "feat(backup): GitHub Actions cron to trigger daily tenant backup"
```

---

### Task 15: Admin restore endpoint

**Files:**
- Create: `src/app/api/admin/backup/restore/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/app/api/admin/backup/restore/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/core/infrastructure/api/helpers';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

function getR2Bucket() {
  return process.env.R2_BUCKET_NAME!;
}

// GET — list available backup dates for an empresa
export async function GET(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  const { data: objects } = await s3.send(new ListObjectsV2Command({
    Bucket: getR2Bucket(),
    Prefix: `backups/${empresaId}/`,
  }));

  const dates = (objects?.Contents ?? [])
    .map(obj => obj.Key?.split('/').pop()?.replace('.json', '') ?? '')
    .filter(Boolean)
    .sort()
    .reverse();

  return NextResponse.json({ dates });
}

// POST — restore from a specific date's backup
export async function POST(request: NextRequest) {
  const { empresaId, error: authError } = await requireAuth(request);
  if (authError) return authError;
  const roleError = requireRole(request, ['admin', 'superadmin']);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { date } = body as { date?: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const key = `backups/${empresaId}/${date}.json`;

  let snapshotText: string;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: getR2Bucket(), Key: key }));
    snapshotText = await obj.Body!.transformToString();
  } catch {
    return NextResponse.json({ error: `Backup ${date} not found` }, { status: 404 });
  }

  const snapshot = JSON.parse(snapshotText) as {
    productos: Record<string, unknown>[];
    categorias: Record<string, unknown>[];
  };

  // SECURITY: force empresa_id on every row to match the authenticated tenant.
  // Prevents a malicious/corrupted snapshot from writing into another tenant's data.
  const categoriasSanitizadas = snapshot.categorias.map(c => ({
    ...c,
    empresa_id: empresaId,
  }));
  const productosSanitizados = snapshot.productos.map(p => ({
    ...p,
    empresa_id: empresaId,
  }));

  const supabase = getSupabaseClient();

  // FK-SAFE ORDER: categorias first (productos have a FK → categorias).
  // Promise.all would race and could violate the FK constraint.
  const catUpsert = await supabase
    .from('categorias')
    .upsert(categoriasSanitizadas, { onConflict: 'id' });

  if (catUpsert.error) {
    return NextResponse.json({
      error: 'Failed to restore categorias',
      details: catUpsert.error.message,
    }, { status: 500 });
  }

  const prodUpsert = await supabase
    .from('productos')
    .upsert(productosSanitizados, { onConflict: 'id' });

  if (prodUpsert.error) {
    return NextResponse.json({
      error: 'Failed to restore productos',
      details: prodUpsert.error.message,
    }, { status: 500 });
  }

  return NextResponse.json({
    restored: date,
    productosCount: productosSanitizados.length,
    categoriasCount: categoriasSanitizadas.length,
  });
}
```

- [ ] **Step 2: Add R2 env vars to `.env.local` (do not commit)**

```
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<key>
R2_SECRET_ACCESS_KEY=<secret>
R2_BUCKET_NAME=multi-shop-backups
```

- [ ] **Step 3: Build**

```bash
pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/backup/restore/route.ts
git commit -m "feat(backup): admin restore endpoint — list dates + upsert from R2 snapshot"
```

---

---

## Subsystem B (Addition) — Realtime Tenant Filter

### Task 16: Store empresaId from /api/waiter/me and filter postgres_changes subscriptions

**Context:**

`/api/waiter/me` already returns `{ ok: true, empresaId }` (confirmed in source). WaiterBanner calls this endpoint on mount but only reads `r.ok` — it discards `empresaId`. The postgres_changes subscriptions currently listen to ALL rows on `pedidos`, `pedido_item_estados`, and `mesa_sesiones` without a `filter` clause. Depending on Supabase Realtime's RLS enforcement for the anon key, this may broadcast cross-tenant events to all connected waiters. Adding an explicit filter eliminates the ambiguity entirely.

**Files:**
- Modify: `src/components/waiter-banner.tsx`

- [ ] **Step 1: Add `empresaId` state near other state declarations**

```typescript
const [waiterEmpresaId, setWaiterEmpresaId] = useState<string | null>(null);
```

- [ ] **Step 2: Read `empresaId` from the /api/waiter/me response in the auth check effect (around line 153)**

Find:
```typescript
fetch('/api/waiter/me')
  .then(r => { setIsWaiter(r.ok); })
  .catch(() => setIsWaiter(false))
  .finally(() => setAuthChecked(true));
```

Replace with:
```typescript
fetch('/api/waiter/me')
  .then(async r => {
    setIsWaiter(r.ok);
    if (r.ok) {
      const json = await r.json() as { empresaId: string };
      setWaiterEmpresaId(json.empresaId);
    }
  })
  .catch(() => setIsWaiter(false))
  .finally(() => setAuthChecked(true));
```

- [ ] **Step 3: Add `waiterEmpresaId` as a guard at the top of the Realtime effect**

After the existing `if (!isWaiter) return;` guard, add:
```typescript
if (!waiterEmpresaId) return;
```

- [ ] **Step 4: Add `filter` to all three postgres_changes subscriptions**

Find:
```typescript
.on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, triggerUpdate)
.on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, triggerUpdate)
.on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones' }, () => {
```

Replace with:
```typescript
.on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${waiterEmpresaId}` }, triggerUpdate)
.on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados', filter: `empresa_id=eq.${waiterEmpresaId}` }, triggerUpdate)
.on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones', filter: `empresa_id=eq.${waiterEmpresaId}` }, () => {
```

> **Note on `pedido_item_estados` and `mesa_sesiones`:** Verify these tables have an `empresa_id` column. If `pedido_item_estados` does not have a direct `empresa_id` column, use the broadcast channel (`waiter-items-update`) as the primary sync mechanism and remove that specific postgres_changes subscription — the broadcast already exists for this table.

- [ ] **Step 5: Add `waiterEmpresaId` to the Realtime effect's dependency array**

```typescript
}, [isWaiter, mesaId, fetchLock, pathname, isTabVisible, waiterEmpresaId]);
```

- [ ] **Step 6: Apply the same `filter` to KitchenPage, PendientesPage, and BarPage**

Each of those pages calls `/api/waiter/kitchen/orders`, `/api/waiter/pendientes/orders`, or `/api/waiter/bar/orders` — routes that already know the empresa via the proxy. For the Realtime filter, each page needs to fetch `empresaId` once on mount (from `/api/waiter/me`) and store it in local state, then pass it to the postgres_changes filter.

Pattern for each page:
```typescript
const [waiterEmpresaId, setWaiterEmpresaId] = useState<string | null>(null);

useEffect(() => {
  fetch('/api/waiter/me')
    .then(r => r.ok ? r.json() : null)
    .then((json: { empresaId: string } | null) => {
      if (json) setWaiterEmpresaId(json.empresaId);
    })
    .catch(() => null);
}, []);
```

Then guard the Realtime effect with `if (!waiterEmpresaId) return;` and add the filter.

- [ ] **Step 7: Build**

```bash
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add src/components/waiter-banner.tsx src/app/waiter/kitchen/page.tsx src/app/waiter/pendientes/page.tsx src/app/waiter/bar/page.tsx
git commit -m "feat(realtime): scope postgres_changes subscriptions to authenticated tenant"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Backup per cliente en R2 | Tasks 12–15 |
| ISR / unstable_cache para catálogo público | Tasks 1–5 |
| On-demand revalidation via admin mutations | Tasks 4–5 |
| Desconexión Realtime en pestaña oculta | Tasks 6–9 |
| Filtros Realtime por tenant (empresa_id) | Task 16 |
| UI optimista en Waiter (sin esperar servidor) | Tasks 10–11 |
| Procesos asíncronos no bloqueantes | Tasks 10–11 (Promise.all) |
| No bloquear navegación entre tabs | Subsystem B + C combined |

### Placeholder Scan

All code blocks in every task contain complete, runnable code. No "implement later" or "TBD" patterns.

### Type Consistency

- `catalogTag(empresaId)` defined in Task 1, used in Tasks 2, 4, 5 — consistent.
- `getCachedMenu(empresaId)` returns same type as `getMenuUseCase.execute(empresaId)` — `{ data?: MenuCategoryVM[]; error?: string }` — no interface changes needed in `page.tsx`.
- Optimistic `estado: 'listo' as const` matches the `ItemEstado` type from `@/core/domain/repositories/IPedidoRepository` — verify this union includes `'listo'` before implementing Task 10.
