# Design: Restaurant Order Tracking with Telegram

**Date:** 2026-05-20
**Branch:** feature/telegram-notifications
**Status:** Approved

---

## Overview

Extend the multi-tenant platform to support a "restaurant" mode where orders from the pedidos subdomain:
1. Generate a `tracking_token` for the customer
2. Notify the restaurant via Telegram with inline time-selector buttons
3. Redirect the customer to a live tracking page
4. Allow the restaurant to set estimated pickup time directly from Telegram

Tienda behavior remains unchanged.

---

## Database Changes

### `empresas` table — 2 new columns

```sql
ALTER TABLE empresas
  ADD COLUMN tipo text NOT NULL DEFAULT 'tienda',          -- 'tienda' | 'restaurante'
  ADD COLUMN telegram_chat_id text NULL;                   -- per-empresa, replaces global env var
```

### `pedidos` table — 3 new columns

```sql
ALTER TABLE pedidos
  ADD COLUMN tracking_token text UNIQUE NULL,              -- uuid, only for restaurants
  ADD COLUMN estimated_minutes int NULL,                   -- set by restaurant via Telegram button
  ADD COLUMN estimated_ready_at timestamptz NULL;          -- calculated: now + estimated_minutes
```

`tracking_token` is nullable — tienda orders do not use it.

### Environment variables

- `TELEGRAM_BOT_TOKEN`: remains global (one bot for all tenants)
- `TELEGRAM_CHAT_ID`: **deprecated** — replaced by `empresas.telegram_chat_id`

---

## Architecture

Clean Architecture layers remain intact: `API Route → Use Case → Repository`

### Behavior fork — Option A (conditional in use case)

`PedidoUseCase.create` receives `empresaTipo` and `telegramChatId`. If `tipo === 'restaurante'`:
- Generates `tracking_token`
- Creates pedido with token
- Sends Telegram message with inline buttons
- Returns `{ numeroPedido, trackingToken }`

If `tipo === 'tienda'`: current behavior, no token, no inline buttons.

---

## Backend Components

### 1. Domain / Entities (`types.ts`)

- `Empresa`: add `tipo: 'tienda' | 'restaurante'`
- `EmpresaPublic`: add `tipo`, `telegramChatId: string | null`
- `Pedido`: add `trackingToken: string | null`, `estimatedMinutes: number | null`, `estimatedReadyAt: string | null`

### 2. `telegram.service.ts`

- `sendTelegramNotification(pedido, chatId)`: receives `chatId` as parameter (no more global env var)
- New function `sendTelegramWithInlineButtons(pedido, chatId)`: sends MarkdownV2 message with inline keyboard:

```
[10 min] [15 min] [20 min] [30 min]
callback_data: "order:{pedidoId}:{minutes}"
```

### 3. `PedidoUseCase.create`

Add parameters: `empresaTipo: 'tienda' | 'restaurante'`, `telegramChatId: string | null`

If restaurante:
1. Generate `tracking_token = crypto.randomUUID()`
2. Pass token to `pedidoRepo.create`
3. Call `sendTelegramWithInlineButtons(pedido, telegramChatId)`
4. Return `{ id, numero_pedido, total, trackingToken }`

### 4. `IPedidoRepository` — 2 new methods

```ts
findByTrackingToken(token: string): Promise<Result<Pedido | null>>
updateEstimatedTime(pedidoId: string, minutes: number): Promise<Result<void>>
```

### 5. `POST /api/pedidos` (modified)

- Reads `empresa.tipo` and `empresa.telegramChatId`
- Passes both to `pedidoUseCase.create`
- Returns `{ success, numeroPedido, pedidoId, trackingToken? }`

### 6. `POST /api/telegram/webhook` (new)

Receives Telegram `callback_query`:
- Parses `callback_data`: `order:{pedidoId}:{minutes}`
- Calls `pedidoRepo.updateEstimatedTime(pedidoId, minutes)`
- Calls `answerCallbackQuery` to confirm to Telegram: "Pedido actualizado a {minutes} minutos"
- Returns 200 always (Telegram requires this)

Security: validate `TELEGRAM_BOT_TOKEN` secret token header.

### 7. `GET /api/orders/status` (new)

```
GET /api/orders/status?token=xxx
```

Public, rate-limited. Returns:
```json
{
  "estimated_minutes": 20,
  "estimated_ready_at": "2026-05-20T21:35:00Z",
  "numero_pedido": 42
}
```

Does NOT expose internal `id`. Returns 404 if token not found.

---

## Frontend Components

### 1. `CartDrawer` — post-order fork

If response includes `trackingToken`:
- `localStorage.setItem('last_order_tracking', trackingToken)`
- `router.push('/tracking/' + trackingToken)`
- No success dialog (tracking page is the confirmation)

If no `trackingToken` (tienda): existing success dialog unchanged.

### 2. `/tracking/[token]` (new page)

- No authentication required
- Polls `GET /api/orders/status?token=[token]` every 5 seconds
- Date/time displayed in Spanish format: `21:35 h` (local time)

**States:**
- `estimated_minutes === null`: "Tu pedido ha sido recibido. En breve recibirás el tiempo estimado."
- `estimated_minutes !== null`: Shows time and estimated ready time
- Token not found (404): "Pedido no encontrado."

**Display:**
```
Tu pedido está en preparación

Pedido #42

Tiempo estimado: 20 minutos
Listo aproximadamente a las 21:35 h
```

Uses tenant colors from `EmpresaPublic` (resolved via domain on SSR).

### 3. Recovery banner (pedidos subdomain layout)

On mount, reads `localStorage.last_order_tracking`. If exists:
```
¿Tienes un pedido en curso? [Ver seguimiento]
```
Non-intrusive banner. Dismissible. Links to `/tracking/[token]`.

---

## Security

- `tracking_token` is the only public access key — never expose `pedido.id` to clients
- Telegram webhook validates secret token via request header
- `GET /api/orders/status` is rate-limited via existing `rateLimitPublic`
- Zod validation on all inputs

---

## Out of Scope

- Realtime (WebSocket/Supabase subscriptions) — polling covers the UX need
- Multiple time options beyond 10/15/20/30 min
- Customer cancellation
- Order history for customers
