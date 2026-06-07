# Design: In-App Kitchen & Bar Order Management

**Date:** 2026-06-07
**Replaces:** Telegram-based kitchen/bar order flow
**Scope:** Phase 1 — Waiter banner badges + Kitchen/Bar pages

---

## Context

Currently, kitchen and bar order management is handled via Telegram:
- Kitchen receives comida orders with Anotado/Preparado buttons
- Bar receives bebida orders with Servido button
- Bar receives a "preparado alert" when kitchen marks food as ready

This design replaces Telegram with in-app UX, keeping the same state machine but surfacing it in dedicated pages accessible from the waiter banner.

---

## Phase 1 Scope

1. **Waiter banner:** two new buttons (Cocina + Bebidas) with live badge counters
2. **Kitchen page:** `/waiter/kitchen` — list of active comida orders
3. **Bar page:** `/waiter/bar` — list of active bebida orders
4. **API:** `GET /api/waiter/orders/counts` — polling endpoint for badge data

Telegram integration for mesa orders is removed in this phase. Telegram for other order types (tienda, recogida, delivery) is NOT affected.

---

## Architecture

Same pattern as the rest of the waiter API:
`API Route (Zod) → Use Case → Repository`

No Supabase Realtime. All live updates via polling (3s interval). This avoids concurrent WebSocket connection costs on Supabase.

---

## 1. Waiter Banner Changes

### New buttons

Two buttons added to the right side of the banner, before the cart button:

- Button 1: Kitchen (UtensilsCrossed icon or similar)
- Button 2: Bar (wine glass / drink icon)

Click navigates to `/waiter/kitchen` or `/waiter/bar` respectively.

Both buttons are always visible when the waiter is logged in (regardless of current pathname, unlike the cart button which is hidden on `/waiter`).

### Badge counters (3 per button)

Each button displays three inline badge circles:

| Badge | Color | Meaning |
|-------|-------|---------|
| Total | Neutral (white/dim) | Active orders of that type not yet completed |
| Listos | Green | Orders ready to be picked up / served |
| Retenidos | Orange | Deferred items (items_diferidos) pending release |

Badges with count 0 can be hidden or shown as dimmed — decided at implementation.

### Sound (Web Audio API)

A ring sound plays when:
- The **total** counter increases (new order arrived)
- The **listos** counter increases (kitchen marked food as preparado)

Detection: compare previous poll values with current values. If either increases, trigger the sound. No external audio asset needed — generated via Web Audio API oscillator.

### Polling

`GET /api/waiter/orders/counts` called every 3 seconds while the waiter banner is mounted. Stopped when the component unmounts. Uses `cache: 'no-store'`.

---

## 2. API Endpoint

### `GET /api/waiter/orders/counts`

**Auth:** waiter JWT (same as all `/api/waiter/*` routes)
**Derives:** `empresa_id` from JWT

**Response:**
```json
{
  "cocina": {
    "total": 4,
    "listos": 1,
    "retenidos": 2
  },
  "bebidas": {
    "total": 3,
    "listos": 0,
    "retenidos": 1
  }
}
```

**Count logic:**

| Counter | Source | Condition |
|---------|--------|-----------|
| cocina.total | pedidos | has comida items, estado != final state, mesa_sesion active |
| cocina.listos | pedidos | has comida items, estado = 'preparado' |
| cocina.retenidos | mesa_sesiones.items_diferidos | items of tipo=comida across all active sessions |
| bebidas.total | pedidos | has bebida items, estado != final state, mesa_sesion active |
| bebidas.listos | pedidos | has bebida items, estado = 'servido' or equivalent ready state |
| bebidas.retenidos | mesa_sesiones.items_diferidos | items of tipo=bebida across all active sessions |

Exact estado values confirmed against DB schema at implementation time.

---

## 3. Kitchen Page — `/waiter/kitchen`

### Layout

Single vertical list, ordered by arrival time (oldest first).

Color legend fixed at the top — shows which color corresponds to each elapsed-time threshold:

| Color | Threshold |
|-------|-----------|
| Default (neutral) | 0–10 min |
| Yellow | 10–20 min |
| Orange | 20–30 min |
| Red-orange | 30–45 min |
| Red | 45–60 min |
| Deep red / alert | 60+ min |

Each order row changes color automatically as time elapses since the order was placed.

### Order row

Each row displays:
- Order number + table name/number
- List of comida items (with quantities and complements)
- Elapsed timer (live, updated every second)
- Color derived from elapsed time

### Interaction — swipe right to left

Swipe advances the order state:
- `nuevo` → `anotado`
- `anotado` → `preparado`

On reaching `preparado`:
- Row disappears from the active list
- Order is marked as "listo para recoger" (triggers the green Listos badge on the waiter banner)
- This is the event that plays the ring sound on the waiter's device

### Polling

Page polls `GET /api/waiter/kitchen/orders` every 3 seconds to refresh the list.

---

## 4. Bar Page — `/waiter/bar`

### Layout

Same structure as kitchen page. Single vertical list ordered by arrival time.

Same color-by-elapsed-time system and legend.

Two types of items appear in this list:
1. **Bebida orders** — drink items from active pedidos
2. **"Listo para recoger" alerts from kitchen** — when kitchen marks comida as preparado, bar gets an alert row showing which food items are ready to be picked up and served

### Order row

Each row displays:
- Order number + table
- List of bebida items (or comida items marked ready, for kitchen alerts)
- Elapsed timer + color

### Interaction — swipe right to left

- Bebida row: `nuevo` → `servido` → row disappears
- Kitchen alert row: swipe to confirm pickup → row disappears

### Polling

Page polls `GET /api/waiter/bar/orders` every 3 seconds.

---

## 5. State Machine

```
COCINA:
nuevo → anotado → preparado (disappears, triggers "listo para recoger" alert in bar)

BAR:
nuevo → servido (disappears)
kitchen-alert → recogido (disappears)
```

---

## 6. Telegram Removal (mesa orders only)

The following Telegram calls are removed for mesa orders:
- `sendTelegramForMesa` — no longer called when a mesa pedido is created
- `sendTelegramBebidasInfo` — no longer called for bebida items
- `sendTelegramPreparadoAlert` — no longer called when kitchen marks preparado
- `editTelegramForMesa` / `editTelegramBebidasInfoForMesa` — no longer called when waiter removes items
- `deleteMessage` calls tied to mesa order lifecycle — removed

Telegram service file and non-mesa functions (tienda, recogida, delivery) are NOT modified.

The DB columns `telegram_message_id` and `telegram_bebidas_message_id` on `pedidos` become unused for new orders. They are not deleted (non-destructive migration preference).

---

## 7. Out of Scope (this phase)

- Telegram removal for non-mesa order types
- Push notifications (browser/mobile)
- Supervisor/kitchen display screen (separate dedicated screen, future phase)
- Historical order view / completed orders history
- Manual time assignment per order
