# Mesa Payments — Atomicidad Completa del Pago Total

> **Fecha**: 2026-07-29
> **Rama objetivo**: `develop`
> **Alcance**: Solo pago completo (non-division, non-custom). División y custom-turn ya son atómicos.

---

## 1. Contexto y Problema

### Mapa completo de rutas de pago

El sistema tiene cuatro rutas de pago de mesa. Solo la del **pago completo** tiene gaps sin cerrar:

| Ruta | Lock | Atomicidad total | Estado |
|------|------|-----------------|--------|
| División (igual por personas) | `claim_and_create_division_pago` con `FOR UPDATE` | Slot + importe en una sola transacción | RESUELTO |
| Personalizado (por items) | `claim_custom_turn` setea `pago_en_curso=true` dentro del RPC | Turno único activo, importe por selección | RESUELTO |
| Pago manual (camarero) | Sin lock — camarero actúa serialmente | No requiere atomicidad adicional | RESUELTO |
| **Pago completo (Redsys)** | `acquire_mesa_lock` (CAS atómico, separado del use case) | SELECT + UPDATE en 3 ops separadas fuera de lock de fila | **GAP** |

### Por qué el flujo custom-turn no tiene este problema

El RPC `claim_custom_turn` setea `pago_en_curso = true` dentro de la misma transacción que el `FOR UPDATE` en `mesa_sesiones`. Cuando el lock se libera, el flag ya está comprometido. El trigger (Pieza 1) añade defensa en profundidad pero no cierra ningún race condition específico del custom-turn.

El pago completo, en cambio, usa `acquire_mesa_lock` como una operación separada (cliente → lock → cliente → use case). Entre ambas operaciones existe una ventana donde un nuevo pedido puede entrar.

### La ventana de vulnerabilidad residual

```
T0: acquire_mesa_lock → UPDATE mesa_sesiones SET pago_en_curso=true → COMMIT
T1: POST /api/pedidos → checkMesaPaymentLock → SELECT lee pago_en_curso (READ COMMITTED)
    Si T1 llega durante la transacción de T0 (sub-ms): lee false → pasa el check
    Si T1 llega después del commit de T0: lee true → 423 (correcto)
T2: initiateRedsysMesaPaymentUseCase → SELECT SUM(pedidos.total) [sin lock de fila]
    Un pedido insertado entre T0 y T2 puede no estar incluido
```

La ventana real dura el tiempo de una transacción PostgreSQL (típicamente 1–5 ms). Probabilidad baja; impacto: el restaurante cobra menos de lo que debe.

### Por qué SERIALIZABLE no resuelve el problema

PostgreSQL SSI requiere que TODAS las transacciones que colisionan usen `SERIALIZABLE`. La ruta de `POST /api/pedidos` corre en `READ COMMITTED` (default de Supabase). Los predicate locks del RPC son invisibles para transacciones no-serializable. El INSERT de pedidos entraría sin conflicto detectado.

### Solución correcta: bloqueo pesimista con `FOR UPDATE`

Un `SELECT ... FOR UPDATE` sobre `mesa_sesiones` en el RPC hace que cualquier INSERT en `pedidos` con esa `sesion_id` necesite adquirir `FOR KEY SHARE` sobre la misma fila. `FOR KEY SHARE` conflicta con `FOR UPDATE`, bloqueando el INSERT hasta que el RPC hace commit. En ese momento, `pago_en_curso = true` ya está comprometido y el trigger rechaza el INSERT.

---

## 2. Diseño — 4 Piezas

### Pieza 1: Trigger `check_session_not_locked` en `pedidos` BEFORE INSERT

**Propósito**: Red de seguridad DB-level. Rechaza cualquier INSERT en `pedidos` cuando `pago_en_curso = true` en la sesión correspondiente. Aplica a todas las rutas de pago (pago total, custom-turn).

**Archivo**: `supabase/migrations/20260729000001_trigger_prevent_order_during_payment.sql`

```sql
CREATE OR REPLACE FUNCTION public.check_session_not_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
BEGIN
  IF NEW.sesion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.mesa_sesiones
    WHERE id = NEW.sesion_id
      AND pago_en_curso = true
      AND pago_iniciado_en > now() - interval '15 minutes'
  ) THEN
    RAISE EXCEPTION 'PAYMENT_IN_PROGRESS'
      USING HINT = 'Cannot add orders while a payment is in progress for this session';
  END IF;
  RETURN NEW;
END;
$$;

-- REVOKEs obligatorios (CLAUDE.md — SECURITY DEFINER rule)
-- Trigger functions no necesitan EXECUTE público; el trigger engine los invoca directamente
REVOKE EXECUTE ON FUNCTION public.check_session_not_locked() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_session_not_locked() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_session_not_locked() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_session_not_locked() TO service_role;

CREATE TRIGGER prevent_order_during_payment
BEFORE INSERT ON public.pedidos
FOR EACH ROW
EXECUTE FUNCTION public.check_session_not_locked();
```

**Detalles de diseño**:
- El guard `NEW.sesion_id IS NOT NULL` excluye pedidos de delivery/recogida (sin `sesion_id`) — cero impacto fuera de mesa.
- TTL de 15 min consistente con `PAYMENT_LOCK_EXPIRY_MS` en el cliente.
- `SECURITY DEFINER` necesario para leer `mesa_sesiones` sin depender del contexto RLS del caller.
- `SET search_path` obligatorio per CLAUDE.md para funciones SECURITY DEFINER.

### Pieza 2: RPC `initiate_mesa_payment_atomic`

**Propósito**: Reemplaza las 3 operaciones separadas del use case (SELECT pedidos + UPDATE pedidos × 2) por una sola transacción atómica con `FOR UPDATE` en `mesa_sesiones`.

**Archivo**: `supabase/migrations/20260729000002_initiate_mesa_payment_atomic.sql`

```sql
CREATE OR REPLACE FUNCTION public.initiate_mesa_payment_atomic(
  p_sesion_id            UUID,
  p_empresa_id           UUID,
  p_payment_order_ref    TEXT,
  p_expected_total_cents INT,  -- 0 = skip check
  p_already_paid_cents   INT DEFAULT 0  -- para modo personalizado: total ya cobrado en turnos anteriores
)
RETURNS TABLE (
  status          TEXT,
  remaining_cents INT,   -- total_db - already_paid (lo que se cobra a Redsys, sin propina)
  anchor_pedido_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_catalog
AS $$
DECLARE
  v_total       NUMERIC := 0;
  v_total_cents INT;
  v_remaining   INT;
  v_anchor_id   UUID;
  v_max_num     INT;
BEGIN
  -- 1. Bloquear fila padre. Serializa INSERTs en pedidos con esta sesion_id
  --    (cualquier INSERT necesita FOR KEY SHARE, que conflicta con FOR UPDATE).
  PERFORM 1
  FROM public.mesa_sesiones
  WHERE id = p_sesion_id
    AND cerrada_at IS NULL
  FOR UPDATE;

  -- 2. Lectura segura del total: ningún INSERT en vuelo puede colarse aquí.
  SELECT
    COALESCE(SUM(p.total), 0),
    MAX(p.numero_pedido)
  INTO v_total, v_max_num
  FROM public.pedidos p
  WHERE p.sesion_id = p_sesion_id
    AND p.empresa_id = p_empresa_id;

  IF v_max_num IS NULL THEN
    RETURN QUERY SELECT 'no_orders'::TEXT, 0, NULL::UUID;
    RETURN;
  END IF;

  v_total_cents := ROUND(v_total * 100)::INT;
  v_remaining   := GREATEST(0, v_total_cents - p_already_paid_cents);

  -- 3. Validar total esperado (skip si p_expected_total_cents = 0).
  --    Se compara con v_remaining (no con v_total_cents) para ser consistente
  --    con lo que el cliente calcula en modo personalizado.
  IF p_expected_total_cents > 0 AND ABS(v_remaining - p_expected_total_cents) > 1 THEN
    RETURN QUERY SELECT 'total_mismatch'::TEXT, v_remaining, NULL::UUID;
    RETURN;
  END IF;

  -- 4. Obtener el pedido anchor (mayor numero_pedido).
  SELECT id INTO v_anchor_id
  FROM public.pedidos
  WHERE sesion_id = p_sesion_id
    AND empresa_id = p_empresa_id
    AND numero_pedido = v_max_num
  LIMIT 1;

  -- 5. Marcar todos los pedidos de la sesión como pending.
  UPDATE public.pedidos
  SET payment_status = 'pending'
  WHERE sesion_id = p_sesion_id
    AND empresa_id = p_empresa_id;

  -- 6. Anotar payment_order_ref y amount en el pedido anchor.
  --    payment_amount_cents = v_remaining (sin propina; la propina se suma en el use case).
  UPDATE public.pedidos
  SET payment_order_ref    = p_payment_order_ref,
      payment_amount_cents = v_remaining
  WHERE id = v_anchor_id;

  -- 7. Activar el lock DENTRO de la transacción.
  --    Crítico: cuando el FOR UPDATE se libere al hacer commit,
  --    pago_en_curso ya es true. El trigger check_session_not_locked
  --    lo leerá y rechazará cualquier INSERT pendiente.
  UPDATE public.mesa_sesiones
  SET pago_en_curso    = true,
      pago_iniciado_en = now()
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_remaining, v_anchor_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT, INT) TO service_role;
```

**Detalles de diseño**:
- El RPC opera en `READ COMMITTED` (default de Postgres). El `FOR UPDATE` explícito es la garantía de serialización — no se necesita `SERIALIZABLE`.
- El step 7 (`UPDATE mesa_sesiones SET pago_en_curso=true`) es el punto crítico: debe estar dentro de la transacción, no en el use case de Next.js.
- `p_already_paid_cents` (default 0) permite soporte para modo personalizado sin duplicar la consulta a `mesa_pagos_personalizados` dentro del RPC. El use case calcula `serverPagadoCents` y lo pasa.
- `propina_cents` no entra en el RPC — el use case añade la propina al `remaining_cents` devuelto para construir el `amountCents` final que va a Redsys.
- `payment_amount_cents` en el pedido anchor se guarda SIN propina (es el importe base); el importe real cobrado por Redsys es `remaining_cents + propinaCents`.

### Pieza 3: Actualizar `initiateRedsysMesaPaymentUseCase.ts`

**Propósito**: Reemplazar el bloque de pago completo (no-división) por una sola llamada al RPC. Eliminar el `UPDATE mesa_sesiones SET pago_en_curso=true` al final (ya lo hace el RPC).

**Archivo**: `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts`

**Cambio**: Dentro del bloque `else` (líneas ~283–341), reemplazar:
```typescript
// ANTES: 3 operaciones separadas
const { data: pedidos } = await supabase.from('pedidos').select(...)
// ... calcular total, mismatch check ...
await supabase.from('pedidos').update({ payment_status: 'pending' }).in('id', pedidoIds)
await supabase.from('pedidos').update({ payment_order_ref, payment_amount_cents }).eq('id', anchorPedido.id)
// ... más abajo, al final del use case ...
await supabase.from('mesa_sesiones').update({ pago_en_curso: true, pago_iniciado_en: ... })
```

Por:
```typescript
// DESPUÉS: 1 RPC atómico
// serverPagadoCents y propinaCents se calculan ANTES (igual que ahora)
const { data: rpcResult, error: rpcError } = await supabase.rpc(
  'initiate_mesa_payment_atomic',
  {
    p_sesion_id:            sesionId,
    p_empresa_id:           input.empresaId,
    p_payment_order_ref:    paymentOrderRef,
    p_expected_total_cents: input.expectedTotalCents ?? 0,
    p_already_paid_cents:   serverPagadoCents,  // 0 para pago normal; > 0 para modo personalizado
  }
);
// mapear status: 'no_orders' → NOT_FOUND, 'total_mismatch' → TOTAL_MISMATCH, 'ok' → continuar
// amountCents = rpcResult[0].remaining_cents + propinaCents
```

**Impacto en el resto del use case**:
- El bloque completo `else` (SELECT pedidos + mismatch check + UPDATE pedidos × 2) se reemplaza por el RPC. Los queries de `propinaCents`, `divisionTipo`, y `serverPagadoCents` se mantienen antes del RPC.
- El bloque `if (!input.esDivision)` al final que hace `await supabase.from('mesa_sesiones').update({ pago_en_curso: true })` se elimina — el RPC ya lo hace.
- La constante `amountCents` pasa a ser `rpcRow.remaining_cents + propinaCents`.
- División (`claim_and_create_division_pago`) no se toca.

### Pieza 4: Manejo de excepción en `POST /api/pedidos`

**Propósito**: Cuando el trigger lanza `PAYMENT_IN_PROGRESS`, capturarlo y devolver 423 en lugar de 500.

**Archivo**: `src/app/api/pedidos/route.ts`

**Cambio**: En `handleMesaOrder`, después de `getPedidoUseCase().createMesaOrder(...)`, añadir manejo del error del trigger:

```typescript
if (!pedidoResult.success) {
  const errorCode = pedidoResult.error.code;
  // Trigger check_session_not_locked lanza PAYMENT_IN_PROGRESS si pago_en_curso=true
  if (errorCode === 'DB_INSERT_ERROR' || pedidoResult.error.message?.includes('PAYMENT_IN_PROGRESS')) {
    return NextResponse.json(
      { error: 'Hay un pago en curso en esta mesa. Espera a que finalice.' },
      { status: 423 }
    );
  }
  if (['PRODUCT_NOT_FOUND', 'INVALID_UUID'].includes(errorCode)) {
    return NextResponse.json({ error: pedidoResult.error.message }, { status: 400 });
  }
  return NextResponse.json({ error: 'Error al crear el pedido de mesa' }, { status: 500 });
}
```

La función `checkMesaPaymentLock` (primera capa) se mantiene — evita el round-trip a la DB en el caso normal. El trigger es la red de seguridad para el sub-milisegundo window.

---

## 3. Requisitos legales y de seguridad verificados

| Requisito | Impacto | Estado tras implementación |
|---|---|---|
| PCI-DSS | Datos de tarjeta solo tocan Redsys. Ninguna pieza nueva almacena datos de tarjeta. | Sin cambios requeridos |
| Ley 11/2021 — hash chain | El trigger aplica BEFORE INSERT, antes del hash. No interfiere con la cadena. | Compatible |
| Art. 66 LGT — no DELETE en pedidos | El trigger es BEFORE INSERT, no afecta al trigger existente `pedidos_no_delete`. | Compatible |
| RGPD — `payment_order_ref` | No es PII. Sin cambios en políticas de retención. | Sin cambios requeridos |
| CLAUDE.md — SECURITY DEFINER | Ambas funciones nuevas incluyen REVOKE FROM PUBLIC/anon/authenticated + GRANT service_role. | Cubierto en diseño |
| CLAUDE.md — search_path | Ambas funciones incluyen `SET search_path = public, extensions, pg_catalog`. | Cubierto en diseño |
| CI — supabase-security-definer.spec.ts | Las nuevas funciones deben aparecer en el test existente como correctamente revocadas. | Verificar en CI |

---

## 4. Sin cambios de schema

No se añaden columnas ni tablas nuevas. Todo es aditivo:
- 1 función trigger nueva + 1 trigger nuevo en tabla existente (`pedidos`)
- 1 función RPC nueva
- Cambios TypeScript en 2 archivos

---

## 5. Flujo completo tras la implementación

```
Cliente: POST /api/mesas/{mesaId}/lock
  → acquire_mesa_lock RPC: CAS UPDATE → pago_en_curso=true COMMITTED

Mientras tanto, si POST /api/pedidos llega:
  → checkMesaPaymentLock: SELECT lee pago_en_curso=true → 423 (caso normal)
  → Si timing es sub-ms y el SELECT lee false:
      → INSERT pedidos → trigger check_session_not_locked fires
      → pago_en_curso=true (ya committed por acquire_mesa_lock) → RAISES EXCEPTION
      → repositorio de pedidos captura PAYMENT_IN_PROGRESS → 423

Cliente: POST /api/redsys/initiate-mesa { esDivision: false, expectedTotalCents }
  → initiate_mesa_payment_atomic RPC:
      SELECT mesa_sesiones FOR UPDATE        ← bloquea nuevos INSERTs en pedidos
      SELECT SUM(pedidos.total)              ← lectura segura
      [mismatch check]
      UPDATE pedidos SET payment_status='pending'
      UPDATE pedidos SET payment_order_ref, payment_amount_cents (anchor)
      UPDATE mesa_sesiones SET pago_en_curso=true, pago_iniciado_en=now()
      COMMIT                                 ← lock liberado; trigger activo con pago_en_curso=true

  → buildRedsysFormData → respuesta al cliente

Cliente: form submit a Redsys → webhook → processRedsysWebhookUseCase
  → UPDATE pedidos SET payment_status='paid' (todos de la sesión)
  → UPDATE mesa_sesiones SET sesion_pagada=true, pago_en_curso=false
```

---

## 6. Archivos afectados

| Archivo | Tipo de cambio |
|---|---|
| `supabase/migrations/20260729000001_trigger_prevent_order_during_payment.sql` | NUEVO |
| `supabase/migrations/20260729000002_initiate_mesa_payment_atomic.sql` | NUEVO |
| `src/core/application/use-cases/payment/initiateRedsysMesaPaymentUseCase.ts` | MODIFICAR — reemplazar bloque full-payment |
| `src/app/api/pedidos/route.ts` | MODIFICAR — catch PAYMENT_IN_PROGRESS |
| `docs/context/mesa-payments-future.md` | ELIMINAR tras verificación |
| `docs/context/mesa-payments.md` | ACTUALIZAR — añadir sección de atomicidad completa |

---

## 7. Verificación

```bash
# 1. Migraciones
pnpm db:smoke

# 2. E2E DB smoke
pnpm e2e:db

# 3. Concurrencia manual (staging con ngrok)
# Simular dos requests concurrentes desde la consola del navegador:
# Promise.all([
#   fetch('/api/redsys/initiate-mesa', { method: 'POST', body: JSON.stringify({ mesaId, esDivision: false }) }),
#   fetch('/api/pedidos', { method: 'POST', body: JSON.stringify({ tipo: 'mesa', mesa_id: mesaId, items: [...] }) })
# ]).then(rs => Promise.all(rs.map(r => r.json()))).then(console.log)
# Resultado esperado: uno de los dos siempre falla con 423 o total_mismatch

# 4. Test del trigger en CI
npx playwright test e2e/compliance/supabase-security-definer.spec.ts
```

---

## 8. Fuera de scope

- Pago por división (`claim_and_create_division_pago`): ya atómico. Sin cambios.
- Pago personalizado (custom-turn): ya atómico (`claim_custom_turn` setea lock dentro del RPC). Sin cambios.
- Pago manual del camarero: operación serial sin race condition. Sin cambios.
- Telegram / Glovo dispatch en webhook: sin cambios.
- Schema de `mesa_pagos_personalizados`, `mesa_division_pagos`, `mesa_item_pagos`: sin cambios.
