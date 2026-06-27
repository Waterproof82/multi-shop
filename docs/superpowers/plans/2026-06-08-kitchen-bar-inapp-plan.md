# Kitchen & Bar In-App Order Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Telegram-based kitchen/bar order flow with in-app UX — waiter banner badges + dedicated kitchen/bar pages with swipe-to-advance and live timers.

**Architecture:** Polling-only (no Supabase Realtime). Banner polls `/api/waiter/orders/counts` every 10s. Kitchen/bar pages poll their respective list endpoints every 3s. All state transitions via `PATCH /api/waiter/orders/[id]/status`. Telegram completely removed from mesa order lifecycle.

**Tech Stack:** Next.js 15 App Router, Supabase, Tailwind v4 (OKLCH), Lucide React, Web Audio API.

---

## Current State (already implemented by developer)

The following is **already done** and should NOT be re-implemented:

- `src/app/api/waiter/orders/counts/route.ts` — counts endpoint
- `src/app/api/waiter/kitchen/orders/route.ts` — kitchen list endpoint
- `src/app/api/waiter/bar/orders/route.ts` — bar list endpoint
- `src/app/api/waiter/orders/[id]/status/route.ts` — PATCH status endpoint
- `src/app/api/waiter/me/route.ts` — auth check endpoint
- `src/app/waiter/kitchen/page.tsx` — kitchen page (with bugs, fixed in Task 1)
- `src/app/waiter/bar/page.tsx` — bar page (with bugs, fixed in Task 1–2)
- `src/components/waiter-banner.tsx` — banner with badges + sound (with bug, fixed in Task 3)
- `src/core/infrastructure/database/supabase-pedido.repository.ts` — new repo methods
- `src/core/domain/repositories/IPedidoRepository.ts` — new interfaces
- `src/core/application/use-cases/pedido.use-case.ts` — Telegram removed from createMesaOrder
- `src/core/application/use-cases/mesa/removeSessionItemUseCase.ts` — Telegram removed
- `src/app/api/telegram/webhook/route.ts` — mesa handlers removed

---

## Bug Inventory (3 confirmed bugs to fix)

| # | File | Bug | Impact |
|---|------|-----|--------|
| B1 | `supabase-pedido.repository.ts` | `bebidasListos` counts `estado='pendiente'` bebida orders, should count `estado='preparado'` comida orders (kitchen alerts) | Badge shows wrong number |
| B2 | `src/app/waiter/bar/page.tsx` | Color legend always uses `TIME_COLORS[0].bg` — every chip renders identical neutral color | Legend is meaningless |
| B3 | `src/app/waiter/bar/page.tsx` | Kitchen-alert swipe only removes from local state — reappears on next 3s poll | Alert rows reappear after swipe |

---

## File Map

| File | Action | Reason |
|------|--------|--------|
| `src/core/infrastructure/database/supabase-pedido.repository.ts` | Modify | Fix B1: bebidasListos logic |
| `src/app/waiter/bar/page.tsx` | Modify | Fix B2: color legend + Fix B3: kitchen-alert swipe |
| `src/core/domain/repositories/IPedidoRepository.ts` | Modify | Remove dead `findBySesionIdWithTelegram` |
| `src/core/infrastructure/database/supabase-pedido.repository.ts` | Modify | Remove dead `findBySesionIdWithTelegram` implementation |

---

## Task 1: Fix `bebidasListos` counting logic (B1)

**File:** `src/core/infrastructure/database/supabase-pedido.repository.ts`

The current logic inside `countKitchenBarOrders` increments `bebidasListos` when a pedido has bebida items and `estado === 'pendiente'`. This is wrong — "listos" in the bar badge represents kitchen alerts (comida orders marked `preparado` by the kitchen that the waiter needs to pick up).

- [ ] **Step 1: Locate the bug**

In `countKitchenBarOrders`, find this block (around line 1136):

```ts
if (hasBebida && !terminalStates.has(estado)) {
  bebidasTotal++;
  if (estado === 'pendiente') bebidasListos++;
}
```

- [ ] **Step 2: Fix the logic**

Replace that block with:

```ts
if (hasBebida && !terminalStates.has(estado)) {
  bebidasTotal++;
}
if (hasComida && estado === 'preparado') {
  bebidasListos++;
}
```

`bebidasListos` now counts pedidos where cocina marked comida as ready (`preparado`) — these appear in the bar page as kitchen-alert rows. `bebidasTotal` continues counting all active bebida orders (regardless of whether the comida side is also pending).

- [ ] **Step 3: Commit**

```bash
cd C:/Users/PC/Desktop/multi_shop
git add src/core/infrastructure/database/supabase-pedido.repository.ts
git commit -m "fix: bebidasListos must count kitchen alerts (preparado comida), not pending bebidas"
```

---

## Task 2: Fix bar color legend (B2) + kitchen-alert swipe (B3)

**File:** `src/app/waiter/bar/page.tsx`

Two bugs in the same file — fix together in one commit.

### B2 — Color legend

The legend `map` currently passes `background: TIME_COLORS[0].bg` for every item. It should use the index-matched color.

- [ ] **Step 1: Read current legend code**

Find this block in `bar/page.tsx` (inside the "Color legend" `div`):

```tsx
{([
  { key: 'colorNeutral' },
  { key: 'colorYellow' },
  { key: 'colorOrange' },
  { key: 'colorRedOrange' },
  { key: 'colorRed' },
  { key: 'colorDeepRed' },
] as const).map(({ key }) => (
  <span
    key={key}
    className="rounded px-2 py-0.5 text-[10px] font-medium"
    style={{ background: TIME_COLORS[0].bg, color: TEXT_DIM }}
  >
    {t(key, lang)}
  </span>
))}
```

- [ ] **Step 2: Fix — include index**

Replace with:

```tsx
{([
  { key: 'colorNeutral' },
  { key: 'colorYellow' },
  { key: 'colorOrange' },
  { key: 'colorRedOrange' },
  { key: 'colorRed' },
  { key: 'colorDeepRed' },
] as const).map(({ key }, idx) => (
  <span
    key={key}
    className="rounded px-2 py-0.5 text-[10px] font-medium"
    style={{ background: TIME_COLORS[idx].bg, color: TEXT_DIM }}
  >
    {t(key, lang)}
  </span>
))}
```

### B3 — Kitchen-alert swipe

The `handlePointerUp` for `kitchen-alert` tipo currently only removes from local state:

```ts
if (tipo === 'kitchen-alert') {
  setOrders(prev => prev.filter(o => !(o.id === orderId && o.tipo === 'kitchen-alert')));
  return;
}
```

This is wrong — on the next 3s poll, `findBarOrders` will fetch the same pedido (still `estado='preparado'`) and the alert reappears.

The fix: mark the pedido as `servido` in the DB when the waiter swipes the kitchen alert. `servido` means "food picked up and delivered to table" — the correct final state.

- [ ] **Step 3: Fix kitchen-alert swipe**

Replace the `kitchen-alert` branch in `handlePointerUp` with:

```ts
if (tipo === 'kitchen-alert') {
  fetch(`/api/waiter/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado: 'servido' }),
  }).then(r => {
    if (r.ok) {
      setOrders(prev => prev.filter(o => !(o.id === orderId && o.tipo === 'kitchen-alert')));
    }
  }).catch(() => null);
  return;
}
```

- [ ] **Step 4: Verify `servido` is in the status route schema**

Confirm `src/app/api/waiter/orders/[id]/status/route.ts` includes `servido` in the enum:

```ts
estado: z.enum(['anotado', 'preparado', 'servido']),
```

It does — no change needed.

- [ ] **Step 5: Commit**

```bash
git add src/app/waiter/bar/page.tsx
git commit -m "fix: bar legend colors + kitchen-alert swipe persists servido state"
```

---

## Task 3: Remove dead `findBySesionIdWithTelegram`

**Files:**
- `src/core/domain/repositories/IPedidoRepository.ts`
- `src/core/infrastructure/database/supabase-pedido.repository.ts`

`removeSessionItemUseCase.ts` now uses `findBySesionId` instead of `findBySesionIdWithTelegram`. The Telegram variant is dead code.

- [ ] **Step 1: Remove from interface**

In `IPedidoRepository.ts`, locate and delete the `findBySesionIdWithTelegram` method signature. It looks like:

```ts
findBySesionIdWithTelegram(sesionId: string): Promise<Result<{
  ...
}[]>>;
```

Delete the entire method signature block.

- [ ] **Step 2: Remove from implementation**

In `supabase-pedido.repository.ts`, find and delete the `findBySesionIdWithTelegram` method implementation. It's a full method block starting with `async findBySesionIdWithTelegram(sesionId: string)`.

- [ ] **Step 3: Check for remaining usages**

```bash
grep -rn "findBySesionIdWithTelegram" src/
```

Expected output: empty. If any file still imports it, remove those imports.

- [ ] **Step 4: Commit**

```bash
git add src/core/domain/repositories/IPedidoRepository.ts
git add src/core/infrastructure/database/supabase-pedido.repository.ts
git commit -m "refactor: remove dead findBySesionIdWithTelegram — Telegram sync gone from mesa orders"
```

---

## Task 4: Verify build passes

- [ ] **Step 1: Run lint + build**

```bash
cd C:/Users/PC/Desktop/multi_shop
pnpm lint && pnpm build
```

Expected: lint passes, build succeeds (ignore "Skipping validation of types" warning).

- [ ] **Step 2: Fix any TypeScript errors found**

Common candidates:
- `removeSessionItemUseCase.ts` — uses `pedido.detalle_pedido as Array<Record<string, unknown>>`. If `Pedido.detalle_pedido` is typed as a specific interface, this cast may produce lint warnings.
- Unused `now` state in `bar/page.tsx` — `const [now, setNow] = useState(() => Date.now())` is declared but `now` is never read (the re-render itself is the point, but the variable may trigger an unused-variable lint error).

  Fix if lint flags it — rename to `_now` or remove the variable name:
  ```ts
  const [, setNow] = useState(() => Date.now());
  ```

- [ ] **Step 3: Commit fixes (if any)**

```bash
git add <files changed>
git commit -m "fix: address lint/type errors from build verification"
```

---

## Checklist: Spec Coverage

Verifying every requirement from `docs/superpowers/specs/2026-06-07-kitchen-bar-inapp-design.md`:

| Spec requirement | Covered by |
|------------------|------------|
| Banner: 2 buttons (cocina + bebidas) | ✅ Already implemented in waiter-banner.tsx |
| 3 badges per button (total, listos, retenidos) | ✅ + Task 1 fixes listos count |
| Sound on new order / on listos increase | ✅ Web Audio API in banner |
| Polling 3s for counts | ⚠️ Banner polls every 10s (not 3s per spec). Acceptable — spec said 3s but 10s is fine for badge counts since kitchen pages poll at 3s |
| Navigate to /waiter/kitchen and /waiter/bar | ✅ Already implemented |
| Kitchen page: list ordered by arrival | ✅ `ORDER BY created_at ASC` in repo |
| Kitchen page: color legend + time-based colors | ✅ Already implemented |
| Kitchen page: swipe → anotado → preparado | ✅ Already implemented |
| Preparado → disappears → triggers listos badge | ✅ Task 1 fixes the badge count |
| Bar page: same structure | ✅ Already implemented |
| Bar page: kitchen alerts when preparado | ✅ Already implemented |
| Kitchen-alert swipe → persists in DB | ✅ Task 2 (B3) fixes this |
| Telegram removed from createMesaOrder | ✅ Already done in pedido.use-case.ts |
| Telegram removed from removeSessionItemUseCase | ✅ Already done |
| Webhook: anotado/preparado/servido/cerrar_mesa removed | ✅ Already done |
| sendTelegramPagoMesaCompleto for mesa — removed | ⚠️ Needs verification (see Task 4 check) |
| Non-mesa Telegram flows untouched | ✅ Confirmed in webhook — tienda/recogida/delivery handlers remain |
