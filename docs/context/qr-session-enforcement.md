# QR Session Enforcement — Mesa Ordering

## Overview

QR Session Enforcement prevents off-site order placement on dine-in tables. The menu is always publicly accessible via the QR URL — no restriction on browsing. However, placing an order requires the customer to physically scan the QR code at the table using the in-app camera.

A successful scan issues a short-lived server-side token. The customer does not need to re-scan within that 20-minute window. After the window expires, the camera activates again on the next order attempt.

This feature is active only for empresas with `tipo = 'restaurante'` that use mesa ordering.

---

## Design Rationale

### Problem

QR codes at restaurant tables are static — the URL never changes. A customer who bookmarks the URL (or copies it from browser history) can place orders from home, causing kitchen confusion and potential fraud.

### Solution

- **Menu browsing** remains public: no restriction. The QR URL `/?mesa={token}` loads the menu freely.
- **Order placement** requires in-app camera validation. On the first order attempt, `QRScannerGate` activates a fullscreen camera overlay. The customer must point the camera at the physical QR code on the table.
- **Successful scan** calls `POST /api/mesas/{mesaId}/token`, which issues a signed token stored in `mesa_client_tokens`. The token is saved to `sessionStorage` (key: `mesa_token_{mesaId}`) and sent as `Authorization: Bearer {token}` on all order requests.
- **20-minute TTL** — once issued, the token is valid for 20 minutes without re-scanning. After expiry, the camera activates again on the next order attempt.
- **Session rotation** — when the waiter closes a table, `closeSesion` runs immediately followed by `openSesion`. All tokens tied to the previous session become invalid because token validation checks `mesa_sesiones.cerrada_at IS NULL`. Old tokens cannot be reused.

### Why NOT gate on the waiter open action?

The mesa is always open (auto-reopened on close). Requiring the waiter to gate each session would add operational friction. Session rotation on close is the correct enforcement point — it's transparent to the waiter but invalidates all previous physical-presence proofs.

---

## Database Schema

### `mesa_client_tokens`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
mesa_id     uuid NOT NULL REFERENCES mesas(id) ON DELETE CASCADE
sesion_id   uuid NOT NULL REFERENCES mesa_sesiones(id) ON DELETE CASCADE
token       text NOT NULL UNIQUE            -- cryptographically random, base64url
expires_at  timestamptz NOT NULL            -- issued_at + 20 minutes
created_at  timestamptz NOT NULL DEFAULT now()
```

**Indexes:**
- `idx_mesa_client_tokens_token` — on `token` (fast lookup on validation)
- `idx_mesa_client_tokens_sesion_id` — on `sesion_id` (cascade invalidation)

**RLS:**
- `anon` access explicitly denied (RESTRICTIVE policy)
- `service_role` has full SELECT/INSERT/UPDATE/DELETE via explicit GRANT

---

## Token Lifecycle

```
Customer attempts to place order
  → client checks sessionStorage: mesa_token_{mesaId}
  → if missing or expired (client-side expiry check):
      QRScannerGate activates fullscreen camera overlay
      Customer scans physical QR at table
      Decode result: "/?mesa={token}"
      POST /api/mesas/{mesaId}/token
        → rate limit: 10 tokens/hour/mesa
        → findActiveSesionByMesa(mesaId) → gets sesionId
        → if no active session → 403 SESSION_NOT_ACTIVE
        → generate cryptographically random token
        → INSERT mesa_client_tokens (expires_at = now() + 20min)
        → return { token, expiresAt }
      Client stores token in sessionStorage (key: mesa_token_{mesaId})
      QRScannerGate closes → cart submission proceeds

Order placed (POST /api/pedidos or GET /api/mesas/{mesaId}/orders)
  → Authorization: Bearer {token}
  → validateMesaClientToken(request)
      → parse Bearer token from header
      → SELECT mesa_client_tokens JOIN mesa_sesiones
        WHERE token = $1
          AND expires_at > now()
          AND mesa_sesiones.cerrada_at IS NULL
      → if not found / expired / session closed:
          401 { code: "TOKEN_EXPIRED" | "SESSION_CLOSED" }
      → returns null (valid)
  → order proceeds

Waiter closes table (POST /api/waiter/mesas/{mesaId}/close)
  → consolidateSesionOrders(sesionId)
  → closeSesion(sesionId)    -- sets cerrada_at = now()
  → openSesion(mesaId, empresaId)  -- creates new sesion immediately
  → all tokens for old sesionId are now invalid
    (cerrada_at IS NULL check fails)
  → ON DELETE CASCADE also removes tokens when sesion row is deleted
```

---

## API Routes

### `POST /api/mesas/{mesaId}/token`

Issues a new mesa client token for a device.

**Auth:** None required — this is the entry point. Rate-limited.

**Rate limit:** `rateLimitMesaTokenIssuance` — 30 tokens/hour per mesa UUID (Upstash Redis, `slidingWindow`). Prefix: `ratelimit:mesa-token`.

**Request body:** `{}` (none required)

**Response:**
```json
{
  "token": "abc123...",
  "expiresAt": "2026-06-03T14:50:00Z"
}
```

**Error codes:**
| Status | Code | Meaning |
|--------|------|---------|
| 429 | — | Rate limit exceeded |
| 403 | `SESSION_NOT_ACTIVE` | No open session for this mesa |
| 500 | — | DB error |

---

## Middleware: `validateMesaClientToken`

File: `src/core/infrastructure/api/validate-mesa-client-token.ts`

Applied to all mesa order endpoints as the first check:
- `GET /api/mesas/{mesaId}/orders`
- `POST /api/pedidos` (when `mesa_id` is present)

**Logic:**
1. Read `Authorization: Bearer {token}` header
2. If missing → `401 { code: "TOKEN_EXPIRED" }`
3. Query `mesa_client_tokens` JOIN `mesa_sesiones` WHERE token matches, not expired, session not closed
4. If no row found → `401 { code: "TOKEN_EXPIRED" or "SESSION_CLOSED" }` (SESSION_CLOSED when token exists but cerrada_at is set)
5. Returns `null` if valid (allows request to proceed)

**Error codes in 401 response:**
- `TOKEN_EXPIRED` — token not found, expired, or missing
- `SESSION_CLOSED` — token was valid but the session was rotated by the waiter

---

## Client Components

### `QRScannerGate`

File: `src/components/qr-scanner-gate.tsx`

A fullscreen dark overlay with an in-app camera feed. Uses `@zxing/browser` (`BrowserQRCodeReader`) for QR decoding — compatible with iOS Safari and Android Chrome.

**State type (`QRGateState`):**
```typescript
export type QRGateState = 'NO_TOKEN' | 'TOKEN_EXPIRED' | 'SESSION_CLOSED';
```

- `NO_TOKEN` — first order attempt, no token in sessionStorage yet
- `TOKEN_EXPIRED` — token found but past 20-minute TTL or server returned TOKEN_EXPIRED
- `SESSION_CLOSED` — server returned SESSION_CLOSED (waiter rotated session); camera not shown, only informational message

**Props:**
```typescript
interface QRScannerGateProps {
  mesaId: string;
  state: QRGateState;
  onTokenIssued: (token: string, expiresAt: string) => void;
  onCancel?: () => void;
}
```

**UI buttons:**
- **Cancel** (`onCancel`) — closes the gate without issuing a token; cart stays open but order is not submitted
- **Continuar sin QR** (simulate) — calls `POST /api/mesas/{mesaId}/token` directly without scanning, for testing or fallback

**Auto-submit on scan:** When a valid token is issued (`onTokenIssued`), `cart-drawer.tsx` stores the token in sessionStorage and immediately calls `handleConfirmOrder()` — no manual resubmit needed.

**Confirmed order toast:** After a successful mesa order, a 2-second fullscreen toast ("¡Pedido confirmado!") is shown at `z-[400]` using `animate-in fade-in zoom-in-95`. A `mesa-order-placed` custom event is also dispatched on `window` to trigger the bounce animation on the "Ver mis pedidos" floating button.

**Key implementation details:**

1. **`startScannerRef` pattern** — `startScanner` schedules retries via `setTimeout(() => startScannerRef.current())`. A direct self-reference inside `useCallback` would hit a temporal dead zone (ESLint `react-hooks/exhaustive-deps`). A `useRef` holds the latest binding, updated via `useEffect`.

2. **React StrictMode orphaned stream fix** — StrictMode runs effects twice. The second invocation calls `stopScanner` (cleanup) before the first invocation's `decodeFromVideoDevice` resolves. A shared `isActiveRef` flag is NOT safe because the second run resets it to `true` before the first await returns. Fix: each `startScanner` invocation creates a **closure-local** `cancelled` flag and registers `() => { cancelled = true }` in `cancelCurrentScanRef`. After `decodeFromVideoDevice` resolves, if `cancelled === true` the orphaned stream is stopped immediately.

```typescript
let cancelled = false;
cancelCurrentScanRef.current = () => { cancelled = true; };
// ... await decodeFromVideoDevice(...)
if (cancelled) {
  controls.stop();
  // stop orphaned tracks
  return;
}
controlsRef.current = controls;
```

3. **`onTokenIssuedRef` — parent re-render stability** — `onTokenIssued` is defined inline in `cart-drawer.tsx` (no `useCallback`), so it's a new reference on every parent render. Including it in `startScanner`'s deps would cause the scanner to restart on each render: `stopScanner() → startScanner()` — camera flickers on/off. Fix: `onTokenIssuedRef` holds the latest callback via a sync `useEffect`. The ref is used inside the decode callback instead of the prop directly. `onTokenIssued` is excluded from `startScanner`'s deps.

```typescript
const onTokenIssuedRef = useRef(onTokenIssued);
useEffect(() => { onTokenIssuedRef.current = onTokenIssued; }, [onTokenIssued]);
// inside decode callback:
onTokenIssuedRef.current(data.token, data.expiresAt);
// startScanner deps: [mesaId, state, stopScanner, lang]  ← no onTokenIssued
```

**Permissions:** Requires `camera=(self)` in `Permissions-Policy` header (set in `next.config.mjs`). The browser will prompt for camera permission on first use.

### Token storage utilities (in `mesa-orders-client.tsx` and `cart-drawer.tsx`)

```typescript
const TOKEN_KEY = (mesaId: string) => `mesa_token_${mesaId}`;

function getStoredToken(mesaId: string): { token: string; expiresAt: string } | null
function storeToken(mesaId: string, token: string, expiresAt: string): void
function isTokenExpired(expiresAt: string): boolean  // checks Date.now() vs expiresAt
```

Tokens are stored in `sessionStorage` — cleared automatically when the tab closes. This is intentional: a tab closure is treated as physical departure from the table.

---

## Domain Layer

### `IMesaClientTokenRepository`

File: `src/core/domain/repositories/IMesaClientTokenRepository.ts`

```typescript
interface TokenValidationResult {
  valid: boolean;
  code?: 'TOKEN_EXPIRED' | 'SESSION_CLOSED';
}

interface IMesaClientTokenRepository {
  issueToken(mesaId: string, sesionId: string): Promise<Result<{ token: string; expiresAt: string }>>;
  validateToken(token: string): Promise<Result<TokenValidationResult>>;
}
```

### `MesaClientTokenUseCase`

File: `src/core/application/use-cases/mesa-client-token.use-case.ts`

```typescript
TOKEN_TTL_MINUTES = 20

issueToken(mesaId: string): Promise<Result<{ token: string; expiresAt: string }>>
  → findActiveSesionByMesa(mesaId)
  → if no session → { success: false, error: { code: 'SESSION_NOT_ACTIVE' } }
  → repo.issueToken(mesaId, sesionId)

validateToken(token: string): Promise<Result<TokenValidationResult>>
  → repo.validateToken(token)
```

---

## Clean Architecture Flow

```
POST /api/mesas/{mesaId}/token
  → Zod UUID validation
  → rateLimitMesaTokenIssuance(mesaId)
  → mesaClientTokenUseCase.issueToken(mesaId)
      → mesaSesionRepository.findActiveSesionByMesa(mesaId)
      → mesaClientTokenRepository.issueToken(mesaId, sesionId)
          → INSERT mesa_client_tokens
      → return { token, expiresAt }
  → 200 { token, expiresAt }

GET /api/mesas/{mesaId}/orders  (and POST /api/pedidos)
  → validateMesaClientToken(request)
      → mesaClientTokenRepository.validateToken(token)
          → SELECT mesa_client_tokens JOIN mesa_sesiones
          → return { valid, code? }
      → if !valid → 401 with code
  → rateLimitMesaPolling(mesaId)
  → [rest of handler]
```

---

## Security Properties

| Property | Implementation |
|----------|---------------|
| **Physical presence** | Camera must decode the actual printed QR — cannot be faked by URL copy |
| **Session binding** | Token is tied to `sesion_id`. Session rotation invalidates all tokens |
| **Short TTL** | 20 minutes — limits damage from a token leak |
| **sessionStorage** | Tokens cleared on tab close — no persistent proof across sessions |
| **Rate limiting** | 30 tokens/hour/mesa — prevents token farming |
| **Server-side validation** | `expires_at` and `cerrada_at` checked on every order request |
| **`!inner` join** | Supabase many-to-one join returns an **object**, not an array. Use `Array.isArray` check: `const sesion = Array.isArray(row.mesa_sesiones) ? row.mesa_sesiones[0] : row.mesa_sesiones` |
| **CASCADE delete** | Token rows deleted when mesa or session is deleted |
| **No camera blocking** | `Permissions-Policy: camera=(self)` allows self-origin camera use |

---

## Known Limitations

- **Multi-device**: Each device needs its own token. A second device at the same table must also scan the QR. This is intentional — it enforces per-device physical presence.
- **Static QR**: The QR URL is static (`/?mesa={token}`). The token here is the mesa token (static identifier), not the session token. Session enforcement happens server-side — the static QR does not change.
- **Camera permission**: Users must grant camera permission in the browser. If denied, the gate shows an error. The "Continuar sin QR" button is always visible as a testing/development fallback — it should be removed or guarded behind a feature flag in strict production deployments.
