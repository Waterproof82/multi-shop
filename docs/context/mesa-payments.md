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

### RPC: `claim_and_create_division_pago(p_sesion_id, p_empresa_id, p_payment_order_ref, p_session_total_cents)`
Reclama un slot de división e inserta la fila en `mesa_division_pagos` de forma atómica en una sola transacción. Usa `FOR UPDATE` sobre `mesa_sesiones` para serializar pagadores concurrentes:

1. Bloquea la fila de sesión con `FOR UPDATE`
2. Cuenta slots activos (non-failed) en `mesa_division_pagos`
3. Si ya no hay slots: retorna `(claimed=false, amount_cents=0)`
4. Calcula el importe — el último pagador absorbe el resto del redondeo
5. Inserta la fila con `status='pending'` y retorna `(claimed=true, amount_cents=N)`

Elimina el race condition donde dos personas reclaman simultáneamente el mismo slot.

### RPC: `get_mesas_with_sessions(p_empresa_id UUID)`
Retorna todas las mesas de la empresa con el estado de sesión activa. Usada por el waiter grid.

Incluye el campo `division_activa BOOLEAN` = `(division_personas IS NOT NULL)`. Esto permite que el grid del camarero muestre estado "pagando" aunque `pago_en_curso = false` — lo que ocurre durante el flujo de división donde cada persona paga de forma independiente sin lock global.

**Importante:** `session_total` se computa como `SUM(pedidos.total)` desde la tabla `pedidos` — NO desde `mesa_sesiones.total`. Esto garantiza que el importe es correcto en todos los estados, incluyendo `pago_en_curso = true`, donde `mesa_sesiones.total` puede ser 0.

```sql
-- session_total siempre refleja la suma real de pedidos
COALESCE((SELECT SUM(p.total) FROM pedidos p WHERE p.sesion_id = ms.id), 0) AS session_total
-- division_activa para el grid del camarero
(ms.division_personas IS NOT NULL) AS division_activa
```

---

## Sistema de Bloqueo de Pago (`pago_en_curso`)

El lock `pago_en_curso` aplica **solo al pago total**. Los pagos de división son independientes y no usan este lock — cada parte se gestiona con el RPC atómico `claim_and_create_division_pago`.

### Flujo del lock — pago total

```
Usuario pulsa "Pagar total" / "Dividir cuenta"
  │
  ├─ POST /api/mesas/{mesaId}/lock
  │    ├─ Si ya hay lock fresco (< 15 min): 423 → otro usuario está pagando
  │    └─ Si no: SET pago_en_curso=true, pago_iniciado_en=now() → 200
  │
  ├─ Todos los demás usuarios en el menú:
  │    └─ próximo poll/realtime detecta pago_en_curso=true
  │         → clearCart() + redirect a /mesa/{mesaId}/orders
  │
  ├─ Todos los demás usuarios en el ticket:
  │    └─ pago_en_curso=true → overlay 💳 full-screen + back button bloqueado
  │
  ├─ GET /api/mesas/{mesaId}/orders  (verificación de total)
  │    ├─ Si total cambió: warning con importe antiguo → nuevo → esperar confirmación
  │    └─ Si total igual: proceder directamente
  │
  └─ POST /api/redsys/initiate-mesa  (pago real)
       └─ Lock ya activo → grace period de 2 min permite continuar al mismo cliente
```

### Flujo de división — sin lock global

```
Usuario pulsa "Pagar mi parte"
  │
  ├─ NO se llama a /api/mesas/{mesaId}/lock
  │
  ├─ POST /api/redsys/initiate-mesa  { esDivision: true }
  │    └─ RPC claim_and_create_division_pago (FOR UPDATE en mesa_sesiones)
  │         ├─ Slot disponible: INSERT mesa_division_pagos + retorna amountCents
  │         └─ Sin slots: retorna ALREADY_PAID (concurrente llegó primero)
  │
  └─ Cada pago es independiente — múltiples personas pueden pagar simultáneamente
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
  → (sin lock de mesa — personas concurrentes pueden pagar simultáneamente)
  → POST /api/redsys/initiate-mesa  { mesaId, esDivision: true }
  → Use case: RPC claim_and_create_division_pago (FOR UPDATE — serializado en DB)
    - Cuenta slots activos no-fallidos
    - Si sin slots: retorna ALREADY_PAID
    - Calcula importe = total / N (última persona: absorbe residuo de redondeo)
    - INSERT INTO mesa_division_pagos con status='pending' (atomic)
  → Redsys procesa → POST /api/redsys/webhook
  → Webhook Path 1 (división):
    - Busca mesa_division_pagos por payment_order_ref
    - UPDATE status='paid' WHERE status='pending' (atómico — idempotencia contra webhooks duplicados)
    - Si ya no era 'pending': retorna skipped=true (idempotente)
    - Llama RPC increment_division_pagos (atómico)
    - Si pagos_realizados < personas: libera lock si había
    - Si pagos_realizados >= personas: marca TODOS los pedidos como 'paid' + Telegram
  → Cliente regresa a /mesa/{mesaId}/orders y ve el progreso actualizado (Realtime)
```

---

## Polling Adaptativo + Realtime

El ticket `/mesa/{mesaId}/orders` combina polling adaptativo y suscripción Realtime para detectar cambios de estado.

### Polling adaptativo

| Estado | Intervalo |
|--------|-----------|
| Normal (sin pago activo) | 10 segundos |
| Pago en curso (`pagoEnCurso = true`) | **3 segundos** |

### Supabase Realtime

Además del polling, el ticket se suscribe a cambios `UPDATE` en `mesa_sesiones` filtrando por `mesa_id`. Cuando Redsys confirma un pago y el webhook actualiza la sesión, el cliente recibe la notificación en tiempo real (< 200ms) sin esperar el próximo ciclo de poll:

```typescript
supabase
  .channel(`mesa-orders-${mesaId}`)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'mesa_sesiones', filter: `mesa_id=eq.${mesaId}` },
    () => { void refresh(); }
  )
  .subscribe();
```

Esto es especialmente importante en pagos de división donde múltiples personas ven el progreso actualizarse en tiempo real después de cada pago confirmado.

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
  → UPDATE mesa_division_pagos SET status='paid'/'failed' WHERE status='pending'
      (atómico — si no era 'pending', el webhook ya fue procesado → retorna skipped=true)
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

## Waiter Grid — Estado "pagando" en división

El grid del camarero (`/waiter`) debe mostrar las mesas en estado "pagando" no solo cuando hay un pago total en curso (`pago_en_curso = true`) sino también cuando hay una división activa — incluso si ninguna persona está procesando su parte en ese momento.

```typescript
// waiter-login-form.tsx
const isPaymentInProgress = (mesa.pagoEnCurso || mesa.divisionActiva) && !mesa.sesionPagada;
```

`divisionActiva` viene del campo calculado en la RPC `get_mesas_with_sessions`:
```sql
(ms.division_personas IS NOT NULL) AS division_activa
```

Esto cubre el caso donde el primer usuario confirma la división (liberando el lock) y otros usuarios todavía no han pagado su parte — sin `divisionActiva`, el grid mostraría la mesa como "libre" incorrectamente.

---

## Liberación de Slots Pendientes (Cancelación / Abandono)

Cuando un usuario inicia un pago de división y no lo completa (cancela en Redsys o cierra la app), el slot queda en estado `pending` y bloquea ese puesto hasta que se libere.

### Mecanismo (Opción B — liberación por el propio cliente)

**Al iniciar el pago:**
- `initiateRedsysMesaPaymentUseCase` devuelve `paymentOrderRef` en la respuesta para pagos de división.
- El cliente almacena este valor en `sessionStorage` bajo la clave `mesa-division-ref-{mesaId}`.

**Al volver a la página (urlKo o reapertura de app):**
- `mesa-orders-client` ejecuta un `useEffect` de un único disparo al montar.
- Si existe un ref almacenado, llama a `DELETE /api/mesas/{mesaId}/division-slot` con ese ref.
- El endpoint hace `UPDATE mesa_division_pagos SET status='failed' WHERE payment_order_ref=? AND status='pending'` — atómico e idempotente.
- Si el webhook ya marcó la fila como `paid`, el UPDATE no afecta ninguna fila → pago preservado.
- El ref se elimina de `sessionStorage` tras la llamada.

```
Usuario cancela en Redsys → urlKo redirect → componente monta
  → useEffect lee ref de sessionStorage
  → DELETE /api/mesas/{mesaId}/division-slot { paymentOrderRef }
  → slot: 'pending' → 'failed'  (o no-op si ya era 'paid')
  → usuario puede reintentar "Pagar mi parte"
```

### Garantía de seguridad con urlOk

Redsys garantiza que el webhook servidor-a-servidor se envía **antes** de redirigir al usuario a urlOk. Por lo tanto, cuando el componente monta desde urlOk, el slot ya es `paid` y el cleanup es un no-op.

El único escenario donde esto podría fallar es una falla de infraestructura de Redsys (webhook no entregado), que requiere soporte manual independientemente de esta implementación.

### Archivos involucrados

| Archivo | Rol |
|---|---|
| `src/app/api/mesas/[mesaId]/division-slot/route.ts` | DELETE: libera slot pending de forma atómica |
| `src/components/mesa-orders-client.tsx` | Almacena ref en sessionStorage + cleanup on mount |
| `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` | Devuelve `paymentOrderRef` en la respuesta para división |

---

## Posibles Mejoras Futuras

- **Realtime en el waiter grid**: el grid del camarero usa polling. Añadir suscripción Realtime reduciría la latencia para detectar cambios de estado de mesas.
- **Cancelación de parte individual con reembolso**: actualmente no hay mecanismo de reembolso si alguien ya pagó su parte y quiere cancelar la división. Requeriría integración con la API de devoluciones de Redsys.

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
| `supabase/migrations/20260610000001_get_mesas_with_sessions_division_activa.sql` | Añade `division_activa` al RPC get_mesas_with_sessions para el waiter grid |
| `supabase/migrations/20260610000002_claim_and_create_division_pago.sql` | RPC atómico: reclama slot + inserta fila en mesa_division_pagos (FOR UPDATE) |
| `src/app/api/mesas/[mesaId]/division-slot/route.ts` | DELETE: libera slot pending al cancelar o abandonar el flujo de Redsys |
| `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` | Use case de inicio de pago — lock solo para pago total, RPC atómico para división |
| `src/core/application/use-cases/payment/processRedsysWebhookUseCase.ts` | Webhook — idempotencia atómica en Path 1 (división) + Path 2 (total) |
| `src/core/domain/repositories/IMesaRepository.ts` | Interfaz MesaWithSession: campo divisionActiva |
| `src/core/infrastructure/database/supabase-mesa.repository.ts` | Mapea division_activa desde el RPC a divisionActiva |
| `src/components/waiter-login-form.tsx` | isPaymentInProgress incluye divisionActiva además de pagoEnCurso |
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
