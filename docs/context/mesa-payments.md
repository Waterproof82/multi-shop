# Mesa Payments — Pagar en mesa con Redsys

## Overview

Cuando está habilitado, el ticket del cliente en `/mesa/{mesaId}/orders` muestra botones de pago al final de la cuenta. El cliente puede pagar el total de la sesión o dividir la cuenta entre varias personas. Cada pago se procesa a través de Redsys TPV.

Esta funcionalidad solo aplica a empresas de tipo `restaurante` y se activa por empresa desde el panel SuperAdmin.

---

## Activación

En el panel SuperAdmin (`/superadmin`) → tabla Empresas → columna **Pagos**:
- El toggle solo aparece para empresas de tipo `restaurante`.
- Al activarlo se guarda `pagos_mesa_habilitados = true` en la tabla `empresas`.
- Si la empresa no tiene las credenciales Redsys configuradas, el pago fallará en el use case (error `PAYMENT_NOT_CONFIGURED`). En desarrollo se usan credenciales de test de Redsys automáticamente.

---

## Database Schema

### `empresas` (delta)
```sql
pagos_mesa_habilitados  boolean NOT NULL DEFAULT false
```

### `mesa_sesiones` (delta)
```sql
division_personas           int          DEFAULT NULL   -- NULL = no división activa
division_pagos_realizados   int NOT NULL DEFAULT 0      -- shares confirmados por Redsys
pago_en_curso               boolean NOT NULL DEFAULT false  -- lock de pago activo
pago_iniciado_en            timestamptz  DEFAULT NULL   -- timestamp del lock (para TTL de 15 min)
```

### `mesa_division_pagos` (nueva tabla)
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
sesion_id           uuid NOT NULL REFERENCES mesa_sesiones(id)
empresa_id          uuid NOT NULL REFERENCES empresas(id)
payment_order_ref   text NOT NULL UNIQUE  -- UNIQUE elimina el race condition
payment_amount_cents int NOT NULL
status              text NOT NULL DEFAULT 'pending'  -- 'pending' | 'paid' | 'failed'
created_at          timestamptz NOT NULL DEFAULT now()
```

El `UNIQUE(payment_order_ref)` garantiza que dos pagos simultáneos no puedan usar la misma referencia, eliminando el race condition donde dos personas pagan a la vez y solo se contabiliza uno.

### `pedidos` (delta — preexistente, usado por esta feature)
```sql
payment_status      text   -- 'pending' | 'paid' | 'failed'
payment_order_ref   text   -- referencia enviada a Redsys (DS_MERCHANT_ORDER)
payment_amount_cents int   -- importe en céntimos enviado a Redsys
```

### RPC: `increment_division_pagos(p_sesion_id UUID)`
Incremento atómico de `division_pagos_realizados`. Retorna `(pagos_realizados INT, personas INT)`. Usa `SECURITY DEFINER` para ejecutarse en contexto de servicio desde el webhook. Garantiza que el contador no se incrementa dos veces si el webhook llega duplicado.

### RPC: `get_mesas_with_sessions(p_empresa_id UUID)`
Retorna todas las mesas de la empresa con el estado de sesión activa. Usada por el waiter grid.

**Importante:** `session_total` se computa como `SUM(pedidos.total)` desde la tabla `pedidos` — NO desde `mesa_sesiones.total`. Esto garantiza que el importe es correcto en todos los estados, incluyendo `pago_en_curso = true`, donde `mesa_sesiones.total` puede ser 0.

```sql
-- session_total siempre refleja la suma real de pedidos
COALESCE((SELECT SUM(p.total) FROM pedidos p WHERE p.sesion_id = ms.id), 0) AS session_total
```

---

## Sistema de Bloqueo de Pago (`pago_en_curso`)

Cuando alguien inicia el proceso de pago, **todos los usuarios de la misma mesa quedan bloqueados inmediatamente**. El bloqueo es DB-level, no client-side.

### Flujo completo del lock

```
Usuario pulsa "Pagar total" / "Dividir cuenta" / "Pagar mi parte"
  │
  ├─ POST /api/mesas/{mesaId}/lock
  │    ├─ Si ya hay lock fresco (< 15 min): 423 → otro usuario está pagando
  │    └─ Si no: SET pago_en_curso=true, pago_iniciado_en=now() → 200
  │
  ├─ Todos los demás usuarios en el menú:
  │    └─ próximo poll (≤ 3s si pagoEnCurso, ≤ 10s si no) detecta pago_en_curso=true
  │         → clearCart() + redirect a /mesa/{mesaId}/orders
  │
  ├─ Todos los demás usuarios en el ticket:
  │    └─ poll detecta pagoEnCurso=true → overlay 💳 full-screen + back button bloqueado
  │
  ├─ GET /api/mesas/{mesaId}/orders  (verificación de total)
  │    ├─ Si total cambió: mostrar warning con importe antiguo → nuevo → esperar confirmación
  │    └─ Si total igual: proceder directamente
  │
  └─ POST /api/redsys/initiate-mesa  (pago real)
       └─ Lock ya activo → grace period de 2 min permite continuar al mismo cliente
```

### Cancelación

- Usuario cancela en la pantalla de verificación de total → `DELETE /api/mesas/{mesaId}/lock` → lock liberado → otros usuarios desbloquean en el próximo poll (≤ 3s)
- Usuario cancela en Redsys → `GET /api/redsys/cancel-mesa?mesaId=...` → lock liberado → redirect al ticket

### TTL automático (abandono)

Si el usuario cierra la app o falla la conexión sin cancelar, el lock expira automáticamente tras **15 minutos** (`pago_iniciado_en` + `LOCK_EXPIRY_MS = 15 * 60 * 1000`). El siguiente intento de pago en la mesa lo ignora.

### Grace period en el use case

`initiateRedsysMesaPaymentUseCase` tiene un **grace period de 2 minutos**: si el lock fue establecido hace menos de 2 minutos, lo considera propio del cliente que pre-bloqueó y permite continuar. Si el lock tiene entre 2 y 15 minutos, lo considera de otro usuario y retorna `PAYMENT_IN_PROGRESS`.

---

## Verificación de Total (Anti-Race Condition)

Antes de cualquier pago, el cliente verifica que el total en DB coincide con lo que se muestra en pantalla. Esto previene el caso donde otro usuario añade un producto después de que alguien abre el ticket.

### Flujo

```
1. Usuario pulsa botón de pago
2. Lock adquirido (otros usuarios bloqueados desde este momento)
3. GET /api/mesas/{mesaId}/orders (fresh fetch)
4. ¿total cambió?
   SI → Warning: "El total se ha actualizado"
        ┌─ Importe antiguo tachado → nuevo importe
        ├─ [Confirmar y pagar] → procede al paso 5
        └─ [Cancelar] → DELETE lock → bloqueo liberado
   NO → Procede directamente al paso 5
5. POST /api/redsys/initiate-mesa → Redsys
```

El total que Redsys cobra siempre se recalcula server-side. El warning es UX — garantiza que el usuario confirma explícitamente el importe antes de pagar.

### Segunda capa de verificación — `expectedTotalCents` en el use case

El check del cliente (paso 3) puede perder un pedido que estaba en vuelo: si el `POST /api/pedidos` de otro usuario empezó ANTES de que se adquiriese el lock pero commitea DESPUÉS de que el cliente lee el total fresco, ese pedido no aparece en el fetch del paso 3.

Para cubrirlo, el cliente pasa `expectedTotalCents` (total verificado en centavos) al hacer `POST /api/redsys/initiate-mesa`. El use case recalcula el total de DB justo antes de construir el form Redsys y, si difiere en más de 1 céntimo, retorna **409 TOTAL_MISMATCH**:

```json
{ "code": "TOTAL_MISMATCH", "newTotalCents": 4250 }
```

El cliente trata el 409 igual que el mismatch client-side: actualiza `sessionData.total` al nuevo importe y muestra el banner de confirmación. El usuario ve el total real y confirma antes de ir a Redsys.

---

## Flujo: Pagar total

```
Cliente en /mesa/{mesaId}/orders
  → click "Pagar total"
  → POST /api/mesas/{mesaId}/lock  (lock inmediato)
  → Verificación de total
  → POST /api/redsys/initiate-mesa  { mesaId, esDivision: false }
  → Use case: suma total de todos los pedidos de la sesión activa (NO de mesa_sesiones.total)
  → Marca todos los pedidos con payment_status = 'pending'
  → El pedido con mayor numero_pedido recibe payment_order_ref (anchor)
  → Activa lock: pago_en_curso=true, pago_iniciado_en=now()
  → Retorna RedsysFormData
  → Cliente hace form submit a Redsys
  → Redsys procesa → POST /api/redsys/webhook (server-to-server)
  → Webhook: verifica firma, marca pedido anchor y todos los de la sesión como 'paid'
  → Webhook: libera lock (pago_en_curso=false)
  → Redsys redirige al cliente a /api/redsys/confirm-mesa → /mesa/{mesaId}/orders
```

---

## Flujo: Dividir cuenta

```
Cliente en /mesa/{mesaId}/orders
  → click "Dividir cuenta"
  → POST /api/mesas/{mesaId}/lock  (lock temporal — liberado tras configurar)
  → Verificación de total
  → Modal selector (2–20 personas) con importe por persona calculado
  → Confirma N personas
  → DELETE /api/mesas/{mesaId}/lock  (lock liberado — división solo configura, no paga)
  → POST /api/mesas/{mesaId}/division  { numPersonas: N }
  → Guarda division_personas=N, division_pagos_realizados=0 en mesa_sesiones
  → UI muestra: barra de progreso + "Pagar mi parte €X.XX"

Por cada persona que paga:
  → click "Pagar mi parte"
  → POST /api/mesas/{mesaId}/lock  (lock mientras paga esta persona)
  → Verificación de total
  → POST /api/redsys/initiate-mesa  { mesaId, esDivision: true }
  → Use case: calcula importe = total / N
    (última persona: paga el residuo para cuadrar al céntimo)
  → INSERT INTO mesa_division_pagos (payment_order_ref UNIQUE — previene duplicados)
  → Activa lock: pago_en_curso=true, pago_iniciado_en=now()
  → Redsys procesa → POST /api/redsys/webhook
  → Webhook Path 1 (división):
    - Busca mesa_division_pagos por payment_order_ref
    - UPDATE status='paid'
    - Llama RPC increment_division_pagos (atómica)
    - Si pagos_realizados < personas: solo libera lock
    - Si pagos_realizados >= personas: marca TODOS los pedidos como 'paid' + Telegram + libera lock
  → Cliente regresa a /mesa/{mesaId}/orders y ve el progreso actualizado
```

---

## Polling Adaptativo

El ticket `/mesa/{mesaId}/orders` usa polling para detectar cambios de estado:

| Estado | Intervalo |
|--------|-----------|
| Normal (sin pago activo) | 10 segundos |
| Pago en curso (`pagoEnCurso = true`) | **3 segundos** |

Cuando un pago termina o se cancela, el overlay 💳 desaparece en **máximo 3 segundos** — sin esperar el ciclo completo de 10s.

---

## Overlays de Estado

### En el menú (`/?mesa={token}`)

Cuando `pagoEnCurso = true` → el menú hace `clearCart()` + **redirect automático** a `/mesa/{mesaId}/orders`. No hay overlay bloqueante en el menú.

### En el ticket (`/mesa/{mesaId}/orders`)

Cuando `pagoEnCurso = true` y el usuario NO es quien está pagando → overlay full-screen 💳:
- Back button bloqueado (`window.history.pushState` en loop de `popstate`)
- Se libera cuando el pago completa o cancela (máx 3s)

### Pantalla de espera post-pago (`sesionPagada = true`)

Una vez pagada la sesión completa, hasta que el camarero cierre la mesa:
- Overlay full-screen 🍽️ "Mesa en preparación"
- Back button bloqueado permanentemente
- Solo se libera cuando el camarero cierra la sesión

---

## `sesionPagada` — Lógica

| Modo | Condición |
|------|-----------|
| Pago total (sin división) | `every(pedido.payment_status === 'paid')` en todos los pedidos de la sesión |
| División | `pagosRealizados >= personas` (del RPC counter, no de `payment_status`) |

La división no usa `payment_status` porque el pedido anchor queda como `paid` tras el primer pago, lo que daría un falso positivo en sesiones de un solo pedido.

---

## API Routes

### `POST /api/redsys/initiate-mesa`

Inicia el pago para la sesión activa de una mesa.

**Body:**
```json
{
  "mesaId": "uuid",
  "esDivision": false,
  "expectedTotalCents": 4250
}
```
`expectedTotalCents` es opcional pero siempre se envía desde el cliente para activar la validación anti-race-condition.

**Response (success):**
```json
{
  "DS_MERCHANT_PARAMETERS": "...",
  "DS_SIGNATURE": "...",
  "DS_SIGNATURE_VERSION": "HMAC_SHA256_V1"
}
```

**Response (409 — total actualizado mientras se procesaba):**
```json
{ "code": "TOTAL_MISMATCH", "newTotalCents": 4250 }
```

**Response (409 — sesión ya pagada):**
```json
{ "code": "ALREADY_PAID" }
```
Ocurre si `sesion_pagada = true` o si el contador de división ya alcanzó el número de personas. El cliente libera el lock, refresca el estado y muestra la pantalla de pago completado.

**Response (423):** Hay otro pago en curso y el lock no está en grace period.

### `POST /api/mesas/{mesaId}/lock`

Adquiere el lock de pago. Retorna 423 si ya hay un lock fresco activo.

**Response (200):** `{ "ok": true }`
**Response (423):** `{ "error": "Hay un pago en curso en esta mesa." }`

### `DELETE /api/mesas/{mesaId}/lock`

Libera el lock de pago (cancela antes de ir a Redsys).

**Response (200):** `{ "ok": true }`

### `GET /api/redsys/cancel-mesa?mesaId={uuid}&redirect={path}`

Endpoint urlKo de Redsys. Libera el lock y redirige al path indicado.

### `POST /api/mesas/{mesaId}/division`

Activa o actualiza la división de cuenta para la sesión activa.

**Body:**
```json
{ "numPersonas": 4 }
```

Resetea `division_pagos_realizados` a 0. Solo funciona si hay una sesión activa.

### `DELETE /api/mesas/{mesaId}/division`

Cancela la división activa (solo si `pagosRealizados === 0`).

### `GET /api/mesas/{mesaId}/orders`

Retorna pedidos + estado de pago completo:

```json
{
  "orders": [...],
  "sesionId": "uuid",
  "total": 52.50,
  "pagosHabilitados": true,
  "division": {
    "personas": 4,
    "pagosRealizados": 1,
    "importePorPersona": 13.125
  },
  "sesionPagada": false,
  "pagoEnCurso": true
}
```

`division` es `null` si no hay división activa. `pagoEnCurso` expira automáticamente si `pago_iniciado_en` tiene más de 15 minutos.

---

## Webhook Redsys

El webhook en `/api/redsys/webhook` es el único mecanismo de confirmación de pago (server-to-server). **No se confía en el redirect urlOk** para marcar pagos.

### Dos paths en el webhook

```
POST /api/redsys/webhook
  → Decodifica DS_MERCHANT_PARAMETERS
  → Busca empresa por payment_order_ref en pedidos (primero)
      o en mesa_division_pagos (fallback — para pagos de división)
  → Verifica firma HMAC-SHA256
  → Ds_Response '0000'-'0099' = éxito

Path 1 — División (mesa_division_pagos row encontrada):
  → UPDATE mesa_division_pagos SET status='paid'/'failed'
  → Llama RPC increment_division_pagos (atómica)
  → Si todos pagaron: UPDATE todos los pedidos SET payment_status='paid'
                       + Telegram notification
  → UPDATE mesa_sesiones SET pago_en_curso=false, pago_iniciado_en=null

Path 2 — Pago total (pedido anchor encontrado, sin fila en division_pagos):
  → UPDATE pedidos SET payment_status='paid' (todos los de la sesión)
  → Telegram notification
  → UPDATE mesa_sesiones SET pago_en_curso=false, pago_iniciado_en=null
```

### Diferencia pago total vs. división

| Caso | Acción en webhook |
|---|---|
| Sin división | Marca todos los pedidos de la sesión como `paid` |
| Con división, shares pendientes | Incrementa contador atómico, libera lock |
| Con división, último share | Incrementa + marca todos los pedidos como `paid` + Telegram |

### Testing en local

Redsys no puede alcanzar `localhost`. Para pruebas locales usar:
```bash
ngrok http 3000
# La URL pública de ngrok va como webhookUrl en el use case
```

---

## Pago Manual por el Camarero

Cuando un cliente paga en efectivo o con terminal externa (no Redsys), el camarero puede registrar el pago desde la vista de la mesa. El botón aparece en `mesa-orders-client.tsx` solo en modo camarero (`isWaiterMode = true`) siempre que `pagosHabilitados || isWaiterMode`.

### Endpoint

```
POST /api/waiter/mesas/{mesaId}/manual-payment
  (requiere waiter_token cookie + x-empresa-id header del proxy)

→ registerManualMesaPaymentUseCase
  → Si hay división activa:
      increment_division_pagos RPC (atómico) → { pagos_realizados, personas }
      Si pagos_realizados >= personas → fullyPaid = true
  → Si no hay división:
      fullyPaid = true directamente
  → Si fullyPaid:
      UPDATE pedidos SET payment_status = 'paid' (todos de la sesión)
      UPDATE mesa_sesiones SET sesion_pagada=true, pago_en_curso=false
      Telegram: sendTelegramPagoMesaCompleto (fire-and-forget)
  → Si no fullyPaid (división parcial):
      UPDATE mesa_sesiones SET pago_en_curso=false  (libera lock si había)
```

**Response (200):**
```json
{ "pagosRealizados": 2, "personas": 4, "fullyPaid": false }
```

**Response (409):** sesión ya pagada.
**Response (404):** no hay sesión activa.
**Response (403):** empresa no coincide.

### Texto del botón

| Caso | Texto |
|------|-------|
| Sin división activa | "Marcar pagada (efectivo)" |
| División activa, pagos pendientes | "Pago manual (N/M pagado)" |
| División activa, último pago | "Pago manual (último)" |

La notificación de Telegram solo se envía cuando `fullyPaid = true` (pago completo o último share de división). Es fire-and-forget — no bloquea el response aunque falle.

---

## Archivos

| Archivo | Rol |
|---|---|
| `supabase/migrations/20260601000001_pagos_mesa_habilitados.sql` | Columna en empresas |
| `supabase/migrations/20260601000002_division_cuenta_mesa.sql` | Columnas de división + RPC increment_division_pagos |
| `supabase/migrations/20260601000003_mesa_division_pagos.sql` | Tabla mesa_division_pagos |
| `supabase/migrations/20260601000004_mesa_sesion_pago_en_curso.sql` | Columnas pago_en_curso + pago_iniciado_en |
| `supabase/migrations/20260603000001_fix_get_mesas_with_sessions_total.sql` | Fix RPC: session_total desde SUM(pedidos) en vez de mesa_sesiones.total |
| `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` | Use case de inicio de pago (lock + grace period) |
| `src/core/application/use-cases/payment/processRedsysWebhookUseCase.ts` | Webhook — Path 1 (división) + Path 2 (total) |
| `src/app/api/redsys/initiate-mesa/route.ts` | Endpoint de inicio de pago |
| `src/app/api/redsys/cancel-mesa/route.ts` | urlKo — libera lock y redirige |
| `src/app/api/redsys/confirm-mesa/route.ts` | urlOk — fallback de confirmación |
| `src/app/api/mesas/[mesaId]/lock/route.ts` | POST (adquirir lock) + DELETE (liberar lock) |
| `src/app/api/mesas/[mesaId]/division/route.ts` | POST (activar división) + DELETE (cancelar) |
| `src/app/api/mesas/[mesaId]/orders/route.ts` | Retorna estado completo incluyendo pagoEnCurso + sesionPagada |
| `src/app/api/pedidos/route.ts` | Mesa path: verifica lock antes de crear pedido (423 si activo) |
| `src/components/mesa-orders-client.tsx` | UI: ticket, botones pago, division modal, lock flow, overlays, adaptive polling, pago manual |
| `src/components/client-menu-page.tsx` | Menú: redirect a ticket cuando pagoEnCurso, overlay waiting screen |
| `src/app/superadmin/empresas-table.tsx` | Toggle "Pagos" en superadmin |
| `src/core/application/use-cases/payment/registerManualMesaPaymentUseCase.ts` | Pago manual: lógica de division counter + marcado pagado + Telegram |
| `src/app/api/waiter/mesas/[mesaId]/manual-payment/route.ts` | Endpoint pago manual (waiter JWT required) |
