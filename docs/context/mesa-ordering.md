# Mesa Ordering — QR Table Ordering

## Overview

Restaurant-mode domains support QR-based table ordering. Customers scan a QR code at their table, browse the menu, and place orders directly — no waiter interaction needed. All orders are grouped by table session and sent to the kitchen via Telegram.

This feature is only active when:
- The empresa `tipo` is `'restaurante'`
- The request domain is NOT the `pedidos.*` subdomain (dine-in, not takeaway)
- A valid `?mesa={token}` query param is present

---

## Database Schema

### `mesas`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id  uuid NOT NULL REFERENCES empresas(id)
numero      integer NOT NULL                        -- table number (display)
nombre      text NULL                               -- optional custom name (e.g. "Terraza 1")
token       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()  -- used in QR URL
sesion_id   uuid NULL REFERENCES mesa_sesiones(id) -- active session FK
```

### `mesa_sesiones`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
mesa_id     uuid NOT NULL REFERENCES mesas(id)
empresa_id  uuid NOT NULL REFERENCES empresas(id)
abierta_en  timestamptz NOT NULL DEFAULT now()
cerrada_en  timestamptz NULL                        -- NULL = session still open
```

### `pedidos` (delta)
```sql
mesa_id     uuid NULL REFERENCES mesas(id)
sesion_id   uuid NULL REFERENCES mesa_sesiones(id)
```

### `empresas` (delta)
```sql
telegram_mesa_chat_id        text NULL   -- Telegram chat for mesa orders (kitchen)
telegram_bebidas_chat_id     text NULL   -- Telegram chat for bar/drinks (optional)
waiter_pin_hash              text NULL   -- bcrypt hash of waiter PIN
```

### `productos` (delta)
```sql
tipo_producto   text NOT NULL DEFAULT 'comida'   -- 'comida' | 'bebida'
```

---

## Customer Flow

```
Customer scans QR
  → /?mesa={token}
  → Cart mode: mesa (items stored per mesa token)
  → POST /api/pedidos  (includes mesa_id + sesion_id)
  → Telegram notification sent to telegram_mesa_chat_id
  → Customer can view ticket at /mesa/{mesaId}/orders
```

The `?mesa={token}` param persists across navigation via the cart context. All orders placed in the same session are grouped and displayed as a running ticket.

---

## API Routes

### `GET /api/mesas?token={uuid}`
Returns mesa info for a given QR token. Rate-limited by mesa UUID (not IP).

**Response:**
```json
{ "numero": 3, "nombre": "Terraza 1" }
```

### `GET /api/mesas/{mesaId}/orders`
Returns all orders in the current open session for a mesa. Polled every 10 seconds by the ticket view. Rate-limited by mesa UUID (120 req/min per mesa).

**Response:**
```json
{
  "sesionId": "uuid",
  "orders": [
    {
      "id": "uuid",
      "createdAt": "2026-05-22T14:30:00Z",
      "items": [
        {
          "nombre": "Spaghetti Carbonara",
          "cantidad": 2,
          "precio": 12.5,
          "complementos": [{ "nombre": "Sin gluten", "precio": 1.0 }],
          "translations": { "en": { "name": "Carbonara Spaghetti" } }
        }
      ]
    }
  ],
  "total": 27.0
}
```

---

## Rate Limiting

Mesa polling endpoints use a dedicated `rateLimitMesaPolling(mesaId)` limiter:
- **Key**: mesa UUID (not IP) — prevents shared bucket exhaustion
- **Limit**: 120 requests/min per mesa
- **Prefix**: `ratelimit:mesa-polling`

This avoids the issue where two polling components (MesaOrderHistory + MesaOrdersClient, 10s each) exhaust the shared IP bucket after ~2 order cycles.

---

## Ticket View — `/mesa/{mesaId}/orders`

The `MesaOrdersClient` component renders a receipt-style ticket:
- Shows all items from all orders in the current session, flattened
- Displays complement names under each item
- **Shows per-item price** and line total (`(precio + complementos) × cantidad`) aligned right
- Translates item names to the current UI language
- Time shown is from the **first order** of the session, in 24h format
- Polls `/api/mesas/{mesaId}/orders` every 10 seconds

---

## Admin Orders Panel — Mesa Behavior

Mesa orders follow a **session-based visibility** model in `/admin/pedidos`:

- **While session is open**: individual pedidos placed at the table are **hidden** from the admin panel. The parallel helper `getOpenSesionIds()` fetches all `mesa_sesiones` with `cerrada_at IS NULL` for the empresa, then `excludeOpenSesionPedidos()` filters those pedidos out before returning results.
- **When session is closed**: `consolidateSesionOrders(sesionId)` runs automatically (triggered by `POST /api/waiter/mesas/{mesaId}/close`). It merges all individual pedidos for that session into a **single consolidated ticket**, deletes the rest, and sets `estado = 'cerrado'`. This ticket then becomes visible in the admin panel.
- **`cerrado` status**: non-interactive — rendered as a `<span>` badge (not a clickable button). Cannot be advanced further. Represents a finalized dine-in ticket.

### `consolidateSesionOrders` logic

```
1. Fetch all pedidos for the session
2. Merge all items arrays into first pedido
3. Sum total + delivery_fee_cents across all pedidos
4. UPDATE first pedido: items=merged, total=sum, estado='cerrado'
5. DELETE all other pedidos for the session
```

---

## Telegram Notification

When a mesa order is placed, items are routed based on `tipo_producto` and group configuration:

**With two groups configured (`telegram_mesa_chat_id` + `telegram_bebidas_chat_id`):**
- Comida items → kitchen group (`telegram_mesa_chat_id`)
- Bebida items → bar group (`telegram_bebidas_chat_id`)

**With only one group:** all items → `telegram_mesa_chat_id` (backwards-compatible).

Example kitchen message:
```
Pedido #42 — Terraza 1 (Mesa 3)

- 2x Spaghetti Carbonara
```

Inline buttons (3-state flow):
```
[ ✅ Anotado ]  [ 🍳 Preparado ]
```
→ Anotado: `[ ✅ Anotado ✓ ] [ 🍳 Preparado ] [ 🔄 Modificar ]`
→ Preparado: `[ 🍳 Preparado ✓ ] [ 🍽️ Servido ] [ 🔄 Modificar ]` + alerta al bar
→ Servido: `[ 🍽️ Servido ✓ ] [ 🗑️ Eliminar ] [ 🔄 Modificar ]`
→ Eliminar: borra el mensaje del chat

See [telegram-notifications.md](../telegram-notifications.md) for the full callback flow.

---

## Component: `MesaOrderHistory`

Shown on the main menu page when `?mesa=` is active. Displays a collapsible summary of orders placed in the current session. Links to `/mesa/{mesaId}/orders` for the full ticket.

## Component: `MesaOrdersClient`

Full ticket view rendered at `/mesa/{mesaId}/orders`. Receipt-style UI with perforated edges, monospace font, running total, item list with complements.
