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
  → sets HttpOnly cookie: waiter_token (JWT, 8h expiry)
  → returns { ok: true }
```
The auth endpoint is now PIN-only. It does NOT look up or assign a mesa.

**Step 2 — Table selection:**

After PIN auth succeeds, `WaiterLoginForm` fetches `GET /api/waiter/mesas` and renders a visual table grid inline. The waiter clicks a table card to claim it:

```
POST /api/waiter/mesa   { mesaNumero: 3 }
  → opens (or resumes) session for that mesa
  → returns { mesaId, mesaNumero, mesaNombre }
  → client saves to sessionStorage (key: waiter_mesa)
  → router.push(`/?mesa=${mesaId}`)
```

On mount, `WaiterLoginForm` pings `GET /api/waiter/me`. If the cookie is already valid, it skips the PIN step and shows the table grid directly.

### Session cookie
- Name: `waiter_token`
- HttpOnly, SameSite=strict
- Payload: `{ empresaId, sub: 'waiter' }`

### Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/waiter/auth` | PIN login — sets cookie, returns `{ ok: true }` |
| `POST` | `/api/waiter/logout` | Clear cookie |
| `GET` | `/api/waiter/me` | Verify session is valid |
| `POST` | `/api/waiter/mesa` | Claim a mesa by number |
| `GET` | `/api/waiter/mesas` | List all mesas with session status |
| `POST` | `/api/waiter/mesas/{mesaId}/open` | Open a table session |
| `POST` | `/api/waiter/mesas/{mesaId}/close` | Close a table session |
| `GET` | `/api/waiter/mesas/{mesaId}/orders` | Get orders for a mesa |
| `GET` | `/api/waiter/productos` | Get products (for order entry) |

---

## Pages

### `/waiter`
Login page. Two-step flow managed by `WaiterLoginForm`:
1. **PIN step** — dark centered card, large password input, `autoComplete="off"` (prevents Chrome password-manager breach warnings). Submit calls `POST /api/waiter/auth`.
2. **Table step** — visual grid of all mesas (same card design as `/waiter/tables`). Each card shows table number, status dot (pulsing green = occupied), and pill badge "Ocupada"/"Libre". Clicking a card calls `POST /api/waiter/mesa` and redirects to `/?mesa={mesaId}`.

### `/waiter/tables`
Grid of all mesas. Each card shows:
- Table number and name
- Session status (open / closed)
- Number of active orders

Clicking a card navigates to the table detail.

### `/waiter/tables/{mesaId}`
Table detail. Shows:
- Current session orders
- Option to add a new order
- Button to close the session

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
```

---

## WaiterBanner

The `WaiterBanner` component is rendered globally in the root layout. It appears as a sticky top bar when a waiter session is active (detected via `waiter_token` cookie + `/api/waiter/me` check).

**Features:**
- Pulsing live indicator dot
- Shows active mesa name
- "Change table" button → redirects to `/waiter/tables`
- **"Close table" button (X icon)** → shown when a session is active. Calls `window.confirm`, then `POST /api/waiter/mesas/{mesaId}/close`, then clears the local waiter session state. Triggers order consolidation (see Session Lifecycle).
- "Logout" button → calls `/api/waiter/logout` and redirects to `/waiter`
- Re-validates session on every route change
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

Mesa cards across both `/waiter` (step 2) and `/waiter/tables` use identical pill badge design:

| State | Indicator | Badge |
|-------|-----------|-------|
| Occupied | Pulsing green dot (`animate-ping`) | Green pill "Ocupada" |
| Free | Static grey dot | Grey pill "Libre" |

Occupied cards also show active order count and session total below the badge. The `activeOrderCount` is computed per-session (not all-time) by querying `pedidos` filtered by `sesion_id IN (activeSesionIds)` and `estado != 'cerrado'`.

---

## Security Notes

- The waiter token has a separate `sub: 'waiter'` claim to distinguish it from admin tokens
- All `/api/waiter/*` routes verify the token before any DB access
- The PIN itself is never stored or logged — only the bcrypt hash
- PIN input uses `autoComplete="off"` (not `"current-password"`) — Chrome would otherwise match against breach databases and show a security warning
- Closing a session prevents new orders from being attributed to it
