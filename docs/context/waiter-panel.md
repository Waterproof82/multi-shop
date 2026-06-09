# Waiter Panel

## Overview

A lightweight PIN-authenticated panel for restaurant staff at `/waiter`. Waiters can view all tables, open/close sessions, see active orders per table, and add orders on behalf of customers.

The waiter panel is only relevant for empresas with `tipo = 'restaurante'` that use mesa ordering.

---

## Authentication

Waiters authenticate with a PIN (4–12 characters). The PIN is stored as a bcrypt hash in `empresas.waiter_pin_hash`.

### Login flow — two steps

**Step 1 — PIN entry:**
```
POST /api/waiter/auth   { pin: "1234" }
  → validates PIN against waiter_pin_hash (bcrypt compare)
  → sets HttpOnly cookie: waiter_token (JWT, 12h expiry)
  → returns { ok: true, empresaId: "uuid" }
```
The auth endpoint is PIN-only. It does NOT look up or assign a mesa.

**Step 2 — Table selection:**

After PIN auth succeeds, `WaiterLoginForm` stores `empresaId` in state, fetches `GET /api/waiter/mesas` and renders the table grid inline with live updates. The waiter clicks a table card to claim it:

```
POST /api/waiter/mesa   { mesaNumero: 3 }
  → opens (or resumes) session for that mesa
  → returns { mesaId, mesaNumero, mesaNombre }
  → client saves to sessionStorage (key: waiter_mesa)
  → router.push(`/?mesa=${mesaId}`)
```

On mount, `WaiterLoginForm` pings `GET /api/waiter/me`. If the cookie is already valid, it skips the PIN step and shows the table grid directly. `empresaId` is recovered from the `/me` response to enable Realtime.

### Session cookie
- Name: `waiter_token`
- HttpOnly, SameSite=strict
- Payload: `{ empresaId, sub: 'waiter' }`

### Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/waiter/auth` | PIN login — sets cookie, returns `{ ok: true, empresaId }` |
| `POST` | `/api/waiter/logout` | Clear cookie |
| `GET` | `/api/waiter/me` | Verify session — returns `{ ok: true, empresaId }` |
| `POST` | `/api/waiter/mesa` | Claim a mesa by number |
| `GET` | `/api/waiter/mesas` | List all mesas with session status |
| `POST` | `/api/waiter/mesas/{mesaId}/open` | Open a table session |
| `POST` | `/api/waiter/mesas/{mesaId}/close` | Close session (consolidate orders) + auto-reopen |
| `POST` | `/api/waiter/mesas/{mesaId}/manual-payment` | Register a cash/external payment (full or one division share) |
| `GET` | `/api/waiter/mesas/{mesaId}/deferred` | Get deferred items for the active session |
| `PUT` | `/api/waiter/mesas/{mesaId}/deferred` | Save/clear deferred items for the active session |

---

## Pages

### `/waiter`
Single entry point. Two-step flow managed by `WaiterLoginForm`:
1. **PIN step** — dark centered card, large password input, `autoComplete="off"` (prevents Chrome password-manager breach warnings). Submit calls `POST /api/waiter/auth`.
2. **Table step** — live grid of all mesas with payment state. Each card shows table number, status dot, pill badge, and session total. Clicking a card calls `POST /api/waiter/mesa` and redirects to `/?mesa={mesaId}`.

### `/waiter/kitchen`

In-app kitchen view. Shows all in-flight `comida` items grouped by order (default) or by table (`Por mesa`). A third filter button **Listos** shows only items ready to serve.

**States per item (swiped via pointer gestures):**

| Estado | Trigger |
|--------|---------|
| `pendiente` | Initial |
| `en_preparacion` | Swipe right |
| `preparado` | Swipe right again (listos) |
| `servido` | Swipe right on listos item |
| Restore | Swipe left |

Items can also be **retenidos** (held/deferred by the kitchen). A retenidos section shows items the waiter set aside; they have an amber tint and can be released back to pending.

**Time-based card colors (oklch, hue progression):**
- `< 10 min` → cool blue (hue 228)
- `10 – 20 m` → teal (hue 168)
- `20 – 30 m` → yellow-green (hue 100)
- `30 – 45 m` → amber (hue 68)
- `45 – 60 m` → orange (hue 35)
- `60+ min` → red (hue 16)

`anotado` orders (waiter-confirmed but not yet submitted) always show yellow regardless of time.

**GroupBy modes:**
- `Por pedido` (default) — one group per order, sorted by `numero_pedido`
- `Por mesa` — grouped by table; within each group, listos items appear first
- `Listos` — filters to show only `preparado` items awaiting service

### `/waiter/bar`

Same UX as `/waiter/kitchen` but shows `bebida` items only. Same time-based color scheme and swipe mechanics. No groupBy toggle (single list).

---

## Session Lifecycle

```
Waiter opens table  → POST /api/waiter/mesas/{mesaId}/open
  → creates row in mesa_sesiones
  → sets mesas.sesion_id = new session UUID

Customer orders (or waiter adds order)
  → POST /api/pedidos with mesa_id + sesion_id
  → individual pedidos created and stored (NOT yet visible in admin panel)

Waiter closes table → POST /api/waiter/mesas/{mesaId}/close
  → pedidoRepository.consolidateSesionOrders(sesionId)
      → merges all session pedidos into one (estado='cerrado')
      → deletes individual pedidos
      → consolidated ticket becomes visible in admin /pedidos
  → mesaSesionUseCase.closeSesion(sesionId)
      → sets mesa_sesiones.cerrada_at = now()
      → sets mesas.sesion_id = NULL
  → mesaSesionUseCase.openSesion(mesaId)   ← auto-reopen
      → creates new empty mesa_sesiones row
      → sets mesas.sesion_id = new session UUID
      → table is immediately available for the next customers
      → old client tokens are invalidated (they reference the closed session)
```

**Close error handling:** If the close endpoint returns a non-2xx/404 response, the banner shows a localized error message for 5 seconds and does NOT navigate. A 404 ("no active session") is treated as success — the table is already libre.

### Manual payment (cash / external)

```
Waiter registers manual payment → POST /api/waiter/mesas/{mesaId}/manual-payment
  → finds active session for the mesa
  → if division active:
      calls increment_division_pagos RPC (atomic counter increment)
      if counter reaches division_personas → fullyPaid = true
  → if no division (full payment):
      fullyPaid = true immediately
  → if fullyPaid:
      updates all pedidos payment_status = 'paid'
      sets sesion_pagada = true, clears pago_en_curso
      sends Telegram notification (fire-and-forget)
      triggers autoCloseMesaAfterPayment (fire-and-forget) → see Auto-close on payment
  → returns { pagosRealizados, personas, fullyPaid }
```

After a successful manual payment, the client clears `sessionStorage` (waiter mesa key) and redirects to `/waiter` — no mesa is left selected in the banner.

Response codes: `404` no active session, `403` wrong empresa, `409` session already paid, `500` DB error.

---

## WaiterBanner

The `WaiterBanner` component is rendered globally in the root layout. It appears as a sticky top bar when a waiter session is active (detected via `waiter_token` cookie + `/api/waiter/me` check).

**Features:**
- Pulsing live indicator dot
- Shows active mesa name
- **Kitchen & Bar buttons** — always visible for authenticated waiters. Navigate to `/waiter/kitchen` and `/waiter/bar`. Each shows three live badge counts (neutral = total in-flight, green = listos, orange = retenidos). Polled every 10 s; plays a short audio ping when counts increase.
- **"Change table" dropdown** — fetches `GET /api/waiter/mesas` on open. First item is always **"Ver todas las mesas"** (navigates to `/waiter`). Remaining items list all mesas with open/libre status. Selecting a libre mesa calls `POST /api/waiter/mesas/{mesaId}/open` first.
- **"Close table" button (X icon)** → shown when a session is active. Before closing, runs a guard chain (all via modal dialogs, no blocking `confirm`):
  1. `pagoEnCurso = true` → **payment dialog**: warns the waiter a Redsys payment is in progress; offers "Desbloquear y cerrar".
  2. `totalItems > 0` (unsent cart items) → **cart dialog**: warns that unsent orders will be lost. "Eliminar pedidos" clears the cart and continues to the next check (step 3 or confirm).
  3. `pagosHabilitados && !sesionPagada && orders.length > 0` → **unpaid dialog**: warns there are unpaid orders. "Ver ticket" navigates to `/mesa/{mesaId}/orders` where the waiter can trigger manual payment.
  4. Otherwise → **confirm dialog**: standard close confirmation.

  On close: `POST /api/waiter/mesas/{mesaId}/close`. On success (2xx or 404), clears local state and redirects to `/waiter`. On error, shows a localized error toast below the banner for 5 seconds without navigating. Triggers order consolidation + auto-reopen (see Session Lifecycle).
- **"Unlock payment" button (🔓)** → shown only when `pago_en_curso = true` for the active mesa. Calls `DELETE /api/mesas/{mesaId}/lock` to release the payment lock.
- "Logout" button → calls `/api/waiter/logout` and redirects to `/waiter`
- Re-validates session on every route change (polls `/api/waiter/me`)
- `z-index: 100`, always visible above all content

---

## Setting the Waiter PIN

The waiter PIN is stored as a bcrypt hash in `empresas.waiter_pin_hash`. To set or change the PIN, update this column directly in Supabase:

```sql
UPDATE empresas
SET waiter_pin_hash = crypt('1234', gen_salt('bf'))
WHERE id = 'your-empresa-id';
```

---

## Table Status Display

Mesa cards in `/waiter` (step 2) reflect four payment states with distinct colors:

| State | Indicator | Color | Badge | Footer |
|-------|-----------|-------|-------|--------|
| Free | Static grey dot | Grey | "Libre" | — |
| Occupied | Pulsing green dot (`animate-ping`) | Green | "Ocupada" | Order count + total |
| Payment in progress | Pulsing amber dot | Amber | "En pago" | Session total |
| Paid | Static violet dot | Violet | "Pagada" | Session total |

Each mesa card exposes two secondary actions:
- **"Ver ticket" button** — visible only when `activeOrderCount > 0`. Opens a receipt-style modal overlay. Fetches `GET /api/mesas/{mesaId}/orders`, merges items with the same name+price, and displays a line-item list with individual and session totals.
- **Deferred items chip** — click navigates to `/?mesa={mesaId}` with the cart pre-opened, so the waiter can release or adjust deferred items directly.

A mesa is considered **occupied** only if it has an active session AND `activeOrderCount > 0`. After a waiter closes a table, the auto-reopen creates a new empty session (`activeOrderCount = 0`), so the card immediately shows as **libre** on the next grid refresh.

The `activeOrderCount` is computed per-session (not all-time) by querying `pedidos` filtered by `sesion_id IN (activeSesionIds)` and `estado != 'cerrado'`. The session IDs come from `get_mesas_with_sessions` RPC which reads `mesas.sesion_id` (the currently linked session).

The `sessionTotal` is computed live from `SUM(pedidos.total)` inside the RPC — NOT from `mesa_sesiones.total`, which may be 0 when payment is in progress.

### Live updates

The table grid uses two mechanisms in parallel:
- **Supabase Realtime** — filtered `postgres_changes` subscription on `mesa_sesiones` for the current `empresa_id`. Triggers an immediate refresh on any UPDATE.
- **2-second polling** — fallback in case the WebSocket is unavailable. Fetches `GET /api/waiter/mesas` with `cache: 'no-store'`.

Both mechanisms run simultaneously while the waiter is on the table grid. `empresaId` (returned by `/api/waiter/auth` and `/api/waiter/me`) is required to scope the Realtime subscription.

---

## Auto-close on Payment

When a mesa session is fully paid (either via manual payment or Redsys), it is automatically closed and reopened without requiring waiter interaction.

Implemented in `autoCloseMesaAfterPayment.ts` (fire-and-forget), called from:
- `registerManualMesaPaymentUseCase` when `fullyPaid = true`
- `processRedsysWebhookUseCase` on both Path 1 (división) and Path 2 (full payment) when `sesion_pagada = true`

**Steps** (mirror the manual close route):
1. Resolve `mesa_id` from `mesa_sesiones`
2. Consolidate individual pedidos into a single ticket
4. Set `cerrada_at = now()` on the session
5. Open a new empty session — invalidates all client QR tokens

---

## Cart UX (Waiter Mode)

The cart drawer has additional waiter-specific controls:

- **Payment banner hidden** — the "no payment required" info strip is hidden in waiter mode.
- **"Lanzar todos los retenidos" button** — shown when `hasDeferredItems`. Opens a confirm dialog; on confirm calls `releaseAllDeferred()` (sets all `deferred = false`) then fires the order once the state update resolves (flag + `useEffect` pattern).
- **Clear cart guard** — if the cart contains deferred items, clearing shows a warning dialog first instead of deleting silently.

---

## Security Notes

- The waiter token has a separate `sub: 'waiter'` claim to distinguish it from admin tokens
- All `/api/waiter/*` routes verify the token before any DB access
- The PIN itself is never stored or logged — only the bcrypt hash
- PIN input uses `autoComplete="off"` (not `"current-password"`) — Chrome would otherwise match against breach databases and show a security warning
- Closing a session prevents new orders from being attributed to it

---

## Deferred Items ("Para servir después")

A waiter can mark one or more cart items as **deferred** before confirming a comanda. Deferred items are excluded from the current kitchen order but persisted to the DB so any waiter can see and release them later.

### DB storage

`mesa_sesiones.items_diferidos JSONB NOT NULL DEFAULT '[]'` — overwritten atomically on every deferred-items update. The `get_mesas_with_sessions` RPC includes this field.

### `DeferredItem` type

```typescript
interface DeferredItem {
  itemId: string;
  itemName: string;
  price: number;
  quantity: number;
  translations?: Record<string, { name: string }>;
  selectedComplements?: Array<{ id: string; name: string; price: number }>;
}
```

### Cart flags

| Flag | Meaning |
|---|---|
| `deferred?: boolean` | Waiter marked this item to send later. Excluded from the next confirm. |
| `fromPending?: boolean` | Pre-loaded from DB when entering a mesa. Sent normally on next confirm. |

### Lifecycle

```
Waiter marks item deferred
  → deferred flag on CartItem (client only)

Waiter confirms comanda
  → non-deferred items → POST /api/pedidos (kitchen)
  → deferred items → PUT /api/waiter/mesas/{mesaId}/deferred (save to DB)
  → non-deferred cleared from cart; deferred items remain visible

Grid refresh
  → MesaCard shows deferred items list (clock icon + "ItemName x qty")

Any waiter enters mesa
  → GET /api/waiter/mesas/{mesaId}/deferred
  → loadDeferredItems() → items appear in cart with fromPending flag

Waiter confirms (releasing deferred)
  → all cart items → POST /api/pedidos
  → PUT /api/waiter/mesas/{mesaId}/deferred with [] (clears DB)
  → cart cleared
```

### UI

- Each cart item in mesa mode shows a **clock button (⏱)** — click to toggle deferred.
- Deferred items: amber row tint, active clock icon.
- `fromPending` items: "pendiente" badge next to the name, no clock toggle (sent on next confirm).
- Confirm button disabled with label "Todos los ítems están diferidos" when all non-pending items are deferred.
- Mesa grid cards show deferred items inline: `🕐 Tiramisú x1, Café x2` (amber, small text).
