# Realtime Hybrid Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace high-frequency polling in staff and client views with Supabase Realtime subscriptions, eliminating ~1.300 DB queries/minute in hour punta while staying within the Free plan's 200 concurrent connection limit.

**Architecture:** Realtime is used as a **trigger only** — the callback calls the existing `fetch()` against the API route. No data is read directly from the Supabase client on the frontend. This keeps auth, RLS, and business logic entirely in the API layer. Two DB tables need to be added to the `supabase_realtime` publication before any client code changes. For `waiter-banner`, both subscriptions are multiplexed into a single WebSocket channel (one connection per device).

**Tech Stack:** Supabase Realtime (`postgres_changes`), `@supabase/supabase-js` `createClient` (anon key, same pattern as `client-menu-page.tsx`), Next.js 14 client components, TypeScript.

---

## Key Patterns

### 1. Singleton client (avoid Socket Churn)

`getSupabaseAnonClient()` already exists as a module-level singleton in
`src/core/infrastructure/database/supabase-client.ts`. It uses `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe for client components. Use it everywhere
instead of `createClient(...)` inside the component. This ensures all subscriptions
share the same underlying WebSocket connection regardless of how many times a `useEffect`
re-runs.

```ts
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
```

### 2. Debounce to avoid Fetch Storms

When pendientes validates an order with 6 items, Supabase emits 6 events in <50ms.
Without a debounce, 6 concurrent fetches fire per device. With 5 staff devices that's
30 simultaneous API calls. Add a 100ms debounce on every staff-view callback:

```ts
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// inside .on() callback:
() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { void fetchItems(); }, 100);
}
```

### 3. Subscribe status logging (dev safety net)

Pass a status callback to `.subscribe()` to catch permission/config errors early:

```ts
.subscribe((status) => {
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
    console.error('[Realtime] channel error:', status);
  }
});
```

### 4. Full useEffect pattern (combining all three)

```ts
const supabase = getSupabaseAnonClient();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const channel = supabase
  .channel('unique-channel-name')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'target_table' }, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { void existingFetchFunction(); }, 100);
  })
  .subscribe((status) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('[Realtime] channel error:', status);
    }
  });

return () => {
  if (debounceTimer) clearTimeout(debounceTimer);
  void supabase.removeChannel(channel);
};
```

---

## Files Modified

| File | Change |
|---|---|
| `supabase/migrations/20260626000001_enable_realtime_pedidos_estados.sql` | **CREATE** — adds `pedido_item_estados` + `pedidos` to Realtime publication |
| `src/components/client-menu-page.tsx` | Remove redundant `setInterval` (Realtime already present) |
| `src/components/mesa-order-history.tsx` | Remove redundant `setInterval` (event listener already present) |
| `src/app/waiter/kitchen/page.tsx` | Replace `setInterval(fetchItems, 3000)` with Realtime on `pedido_item_estados` |
| `src/app/waiter/bar/page.tsx` | Replace `setInterval(fetchOrders, 3000)` with Realtime on `pedido_item_estados` |
| `src/app/waiter/pendientes/page.tsx` | Replace `setInterval(fetchPendientes, 3000)` with Realtime on `pedidos` + `pedido_item_estados` |
| `src/components/waiter-login-form.tsx` | Replace `setInterval(refresh, 2000)` with Realtime trigger on `mesa_sesiones` |
| `src/components/waiter-banner.tsx` | Replace both `setInterval` (fetchLock 10s + fetchCounts 10s) with one multiplexed channel |

---

## Task 0: Migration — Enable Realtime on pedido_item_estados and pedidos

**Files:**
- Create: `supabase/migrations/20260626000001_enable_realtime_pedidos_estados.sql`

Context: `mesa_sesiones` already works with Realtime (see `20260602000002_enable_realtime_mesa_sesiones.sql`). `pedido_item_estados` and `pedidos` are not in the `supabase_realtime` publication yet. `REPLICA IDENTITY FULL` is required so UPDATE events include enough data for the Realtime server to route them.

- [ ] **Step 1: Create the migration file**

```sql
-- Enable Realtime on pedido_item_estados so kitchen/bar/pendientes can subscribe
-- to item state changes (pendiente → en_preparacion → preparado → servido/cancelado).
-- REPLICA IDENTITY FULL is required for UPDATE events to include previous row data.
ALTER TABLE public.pedido_item_estados REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedido_item_estados;

-- Enable Realtime on pedidos so pendientes can detect new orders immediately.
ALTER TABLE public.pedidos REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos;
```

Save to: `supabase/migrations/20260626000001_enable_realtime_pedidos_estados.sql`

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: migration applied without errors. Verify in Supabase Dashboard → Database → Replication that `pedido_item_estados` and `pedidos` appear in the `supabase_realtime` publication.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260626000001_enable_realtime_pedidos_estados.sql
git commit -m "feat(realtime): enable realtime publication on pedido_item_estados and pedidos"
```

---

## Task 1: Quick Wins — Remove Redundant Polling

**Files:**
- Modify: `src/components/client-menu-page.tsx`
- Modify: `src/components/mesa-order-history.tsx`

Context: `client-menu-page.tsx` already has a Supabase Realtime subscription on `mesa_sesiones` (lines 128–150) that handles `pago_en_curso`, `sesion_pagada`, and `esperando_activacion`. The `setInterval` at line 121 polls the same data — it's redundant. `mesa-order-history.tsx` already has a `tracking-token-added` event listener (line 56) that covers the relevant update case; the `setInterval` at line 50 is a safety net that's no longer needed.

### 1a — client-menu-page.tsx

- [ ] **Step 1: Remove the setInterval**

In `src/components/client-menu-page.tsx`, find the `useEffect` that contains `setInterval` (around line 88). Remove only the interval — keep the initial `void check()` call and the full `check` function, because the initial fetch on mount is still needed to set `mesaEsperandoActivacion` state before the Realtime subscription fires.

Replace:
```ts
    void check();
    const interval = setInterval(() => { void check(); }, 10000);
    return () => {
      clearInterval(interval);
```
With:
```ts
    void check();
    return () => {
```

- [ ] **Step 2: Verify lint**

```bash
pnpm lint
```
Expected: no errors in `client-menu-page.tsx`.

### 1b — mesa-order-history.tsx

- [ ] **Step 3: Remove the setInterval**

In `src/components/mesa-order-history.tsx`, remove the interval from the `useEffect` at line 47. Keep the initial `void fetchCount(mesaId)` call.

Replace:
```ts
    void fetchCount(mesaId);
    const interval = setInterval(() => { void fetchCount(mesaId); }, 10000);
    return () => clearInterval(interval);
```
With:
```ts
    void fetchCount(mesaId);
```
(No cleanup needed — no interval to clear.)

- [ ] **Step 4: Verify lint**

```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/client-menu-page.tsx src/components/mesa-order-history.tsx
git commit -m "perf: remove redundant polling in client-menu-page and mesa-order-history"
```

---

## Task 2: Kitchen — Replace 3s Polling with Realtime

**Files:**
- Modify: `src/app/waiter/kitchen/page.tsx`

Context: `fetchItems` calls `/api/waiter/kitchen/orders`. The `setInterval` at line 166 polls every 3s. The `tick` interval at line 171 forces a re-render every 1s for timers — **do not remove it**, it's unrelated to data fetching.

- [ ] **Step 1: Add the import**

At the top of `src/app/waiter/kitchen/page.tsx`, add:
```ts
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
```

- [ ] **Step 2: Replace the polling useEffect**

Find the `useEffect` that creates `poll` and `tick` (around line 164). Replace only the `poll` setInterval with a Realtime subscription. Keep `tick` as-is.

Replace:
```ts
    void fetchItems();
    const poll = setInterval(fetchItems, 3000);
    const tick = setInterval(() => setItems(p => [...p]), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
```
With:
```ts
    void fetchItems();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('waiter-kitchen-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchItems(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-kitchen-items error:', status);
        }
      });

    const tick = setInterval(() => setItems(p => [...p]), 1000);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
```

- [ ] **Step 3: Lint and build**

```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/waiter/kitchen/page.tsx
git commit -m "perf(kitchen): replace 3s polling with supabase realtime on pedido_item_estados"
```

---

## Task 3: Bar — Replace 3s Polling with Realtime

**Files:**
- Modify: `src/app/waiter/bar/page.tsx`

Context: identical to Task 2. `fetchOrders` calls `/api/waiter/bar/orders`. The `tick` interval at line 215 is for timers — keep it. The `interval` at line 343 is a separate concern (check inside the component what it does before touching it).

- [ ] **Step 1: Add the import**

At the top of `src/app/waiter/bar/page.tsx`, add:
```ts
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
```

- [ ] **Step 2: Replace the polling useEffect**

Find the `useEffect` that creates `poll` and `tick` (around line 207). Replace `poll` with Realtime. Keep `tick` and any other intervals untouched.

Replace:
```ts
    void fetchOrders();
    const poll = setInterval(fetchOrders, 3000);
    const tick = setInterval(() => setOrders(p => [...p]), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
```
With:
```ts
    void fetchOrders();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('waiter-bar-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchOrders(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-bar-items error:', status);
        }
      });

    const tick = setInterval(() => setOrders(p => [...p]), 1000);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
```

- [ ] **Step 3: Lint and build**

```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/waiter/bar/page.tsx
git commit -m "perf(bar): replace 3s polling with supabase realtime on pedido_item_estados"
```

---

## Task 4: Pendientes — Replace 3s Polling with Realtime

**Files:**
- Modify: `src/app/waiter/pendientes/page.tsx`

Context: `fetchPendientes` calls `/api/waiter/pendientes`. Pendientes needs to react to two events: (a) new `pedidos` INSERT (new order arrives) and (b) `pedido_item_estados` changes (items validated/cancelled). Both tables are now in the Realtime publication (Task 0). Both go into the same channel using two `.on()` calls — one WebSocket connection for both.

- [ ] **Step 1: Add the import**

```ts
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
```

- [ ] **Step 2: Replace the polling useEffect**

Find the `useEffect` with `setInterval(fetchPendientes, 3000)` (around line 175).

Replace:
```ts
    void fetchPendientes();
    const poll = setInterval(fetchPendientes, 3000);
    const tick = setInterval(() => setMesas(p => [...p]), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
```
With:
```ts
    void fetchPendientes();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void fetchPendientes(); }, 100);
    };
    const channel = supabase
      .channel('waiter-pendientes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, trigger)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-pendientes error:', status);
        }
      });

    const tick = setInterval(() => setMesas(p => [...p]), 1000);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
```

- [ ] **Step 3: Lint and build**

```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/waiter/pendientes/page.tsx
git commit -m "perf(pendientes): replace 3s polling with supabase realtime on pedidos + pedido_item_estados"
```

---

## Task 5: waiter-login-form — Replace 2s Polling with Realtime Trigger

**Files:**
- Modify: `src/components/waiter-login-form.tsx`

Context: `refresh` (line 356) calls `/api/waiter/mesas` to get the live mesa list. The `setInterval(refresh, 2000)` (line 374) runs when `step` is in the "mesas list" view. `mesa_sesiones` is already in the `supabase_realtime` publication. Subscribe to it and use it as a trigger to call `refresh`. The subscription should only be active when `step` is the mesas-list view (same condition as the existing interval).

- [ ] **Step 1: Add the import**

```ts
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
```

- [ ] **Step 2: Replace the polling useEffect**

Find the `useEffect` that contains `setInterval(() => { void refresh(); }, 2000)` (around line 372). Note: the existing `useEffect` already has `step` in its dependency array — keep it there. The Realtime channel will be recreated (cheaply, without WebSocket reconnect since the client is a singleton) whenever `step` changes, ensuring the channel is only active in the mesas-list view.

Replace:
```ts
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(interval);
```
With:
```ts
    void refresh();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('waiter-login-mesas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void refresh(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-login-mesas error:', status);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
```

Verify that `step` remains in the dependency array of this `useEffect` after the change.

- [ ] **Step 3: Lint and build**

```bash
pnpm lint && pnpm build
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/waiter-login-form.tsx
git commit -m "perf(waiter-login): replace 2s polling with supabase realtime trigger on mesa_sesiones"
```

---

## Task 6: waiter-banner — Multiplexed Single Channel

**Files:**
- Modify: `src/components/waiter-banner.tsx`

Context: The banner has two polling intervals:
1. `fetchLock` every 10s → polls `/api/mesas/[id]/lock` for `pago_en_curso`
2. `fetchCounts` every 10s → polls `/api/waiter/orders/counts` for kitchen/bar/llamadas badges

Both can be replaced with a single Supabase Realtime channel that multiplexes two table subscriptions over one WebSocket connection. `fetchLock` reacts to `mesa_sesiones` changes (pago_en_curso lives there). `fetchCounts` reacts to `pedido_item_estados` changes (kitchen/bar counts) and `mesa_sesiones` changes (llamadas). All three `.on()` calls share one channel — one connection.

The channel should only be created when `isWaiter` is `true` (same guard as the existing `fetchCounts` useEffect).

- [ ] **Step 1: Add the import**

```ts
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
```

- [ ] **Step 2: Replace fetchLock polling**

Find the `useEffect` that creates `interval` for `fetchLock` (around line 207). Replace:
```ts
    void fetchLock(mesaId);
    const interval = setInterval(() => { void fetchLock(mesaId); }, 10_000);
    return () => clearInterval(interval);
```
With:
```ts
    void fetchLock(mesaId);
```
(fetchLock will now be triggered by the shared Realtime channel in Step 3.)

- [ ] **Step 3: Replace fetchCounts polling with multiplexed Realtime channel**

Find the `useEffect` that creates `fetchCounts` and its `setInterval` (around line 215). Replace the entire `useEffect`:

```ts
  useEffect(() => {
    if (!isWaiter) return;

    const fetchCounts = async () => {
      try {
        const r = await fetch('/api/waiter/orders/counts');
        if (r.status === 401) { setIsWaiter(false); return; }
        if (!r.ok) return;
        const json = await r.json() as CountsPayload;
        setCounts(json);
      } catch { /* ignore */ }
    };

    void fetchCounts();
    const interval = setInterval(fetchCounts, 10_000);
    return () => clearInterval(interval);
  }, [isWaiter]);
```

With:

```ts
  useEffect(() => {
    if (!isWaiter) return;

    const fetchCounts = async () => {
      try {
        const r = await fetch('/api/waiter/orders/counts');
        if (r.status === 401) { setIsWaiter(false); return; }
        if (!r.ok) return;
        const json = await r.json() as CountsPayload;
        setCounts(json);
      } catch { /* ignore */ }
    };

    void fetchCounts();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('waiter-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchCounts(); }, 100);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void fetchCounts();
          if (mesaId) void fetchLock(mesaId);
        }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-banner error:', status);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [isWaiter, mesaId, fetchLock]);
```

Note: `mesaId` and `fetchLock` are now dependencies of this effect. Since `getSupabaseAnonClient()` is a singleton, re-running this effect when `mesaId` changes only destroys/recreates the **channel** (a lightweight object), not the WebSocket connection.

- [ ] **Step 4: Lint and build**

```bash
pnpm lint && pnpm build
```
Expected: no errors. If ESLint reports missing deps in the `useEffect`, add them to the dependency array — do not disable the rule.

- [ ] **Step 5: Commit**

```bash
git add src/components/waiter-banner.tsx
git commit -m "perf(waiter-banner): replace dual 10s polling with single multiplexed realtime channel"
```

---

## Self-Review Checklist

- [x] **Task 0** covers `pedido_item_estados` + `pedidos` Realtime publication — prerequisite for Tasks 2–5
- [x] **Task 1** removes polling in `client-menu-page` and `mesa-order-history` — no new Realtime needed (already present / event-driven)
- [x] **Tasks 2–4** cover all three staff views (kitchen, bar, pendientes) at 3s intervals
- [x] **Task 5** covers `waiter-login-form` at 2s
- [x] **Task 6** covers `waiter-banner` dual 10s intervals with a single multiplexed channel
- [x] `mesa-orders-client.tsx` deliberately excluded: Redsys fast-poll (3s) must stay; 10s passive poll is acceptable at this scale; Realtime requires filtering by `mesa_id` which `pedido_item_estados` doesn't have — defer to Pro plan iteration
- [x] `tracking-page-client.tsx` stop condition already fixed in previous session (not in scope here)
- [x] Every task ends with `pnpm lint` or `pnpm lint && pnpm build`
- [x] `getSupabaseAnonClient()` singleton used across all components — reuses the same underlying WebSocket connection and prevents socket churn when effects re-run
- [x] Channel names are unique strings per component — no collision risk
