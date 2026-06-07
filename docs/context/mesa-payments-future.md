# Mesa Payments — Eliminación completa del race condition (futura implementación)

## Estado actual

La implementación actual usa **dos capas de verificación** de total antes de iniciar un pago Redsys:

1. **Cliente**: después de adquirir el lock, hace un fetch fresco del total y muestra un banner si cambió.
2. **Servidor** (`initiateRedsysMesaPaymentUseCase`): recibe `expectedTotalCents`, recalcula el total de DB y devuelve 409 si difieren.

Esto cubre el ~99.999% de los casos reales.

---

## Ventana residual

Existe una ventana teórica de microsegundos:

```
User B:  POST /api/pedidos → lock check: sin lock ✓ → INSERT pedidos (en vuelo)
User A:  POST /lock → lock acquired
User A:  use case: SELECT pedidos ← B aún no commitó
User B:  commit
User A:  Redsys cobra el total sin incluir el pedido de B
```

El `SELECT` del use case y el `INSERT` de B pueden solaparse. Es técnicamente posible aunque prácticamente improbable.

**Consecuencia real**: User A paga de menos (el pedido de B no está incluido). El restaurante pierde ese importe o debe reclamarlo manualmente.

---

## Por qué SERIALIZABLE no funciona aquí

La primera intuición es usar `SET default_transaction_isolation TO 'serializable'` en el RPC. Supabase / PostgREST sí lo soporta desde la versión 11.1 — PostgREST lee esa config del schema cache y envuelve la llamada en una transacción con el nivel indicado.

**Sin embargo, SERIALIZABLE no resuelve el problema.** Postgres implementa aislamiento serializable mediante SSI (Serializable Snapshot Isolation). La regla de oro del SSI es: **todas las transacciones que colisionan deben ejecutarse en SERIALIZABLE**. La transacción del endpoint estándar de pedidos (`POST /api/pedidos`) corre en `READ COMMITTED` (el default de Supabase/Postgres). Al no ser SERIALIZABLE, Postgres no comprueba ni respeta los predicate locks del RPC. El INSERT de User B entra silenciosamente y el RPC no aborta.

---

## Solución correcta: bloqueo pesimista sobre la fila padre

La solución robusta y eficiente usa **FOR UPDATE sobre `mesa_sesiones`**, aprovechando la FK de `pedidos → mesa_sesiones`.

### Mecánica

```
RPC User A:
  1. SELECT ... FOR UPDATE sobre mesa_sesiones WHERE id = sesion_id
     → la fila del padre queda bloqueada en modo exclusivo

User B (INSERT pedidos):
  → Postgres necesita validar la FK pedidos.sesion_id → mesa_sesiones.id
  → intenta adquirir FOR KEY SHARE sobre la fila del padre
  → la fila ya está bloqueada FOR UPDATE por User A
  → User B queda CONGELADO esperando

RPC User A:
  2. SELECT pedidos (total seguro — User B no puede insertar)
  3. UPDATE pedidos (payment_status='pending', etc.)
  4. UPDATE mesa_sesiones SET pago_en_curso = true  ← DENTRO del RPC, antes del commit
  5. commit → libera el lock

User B (se desbloquea):
  → el INSERT procede en READ COMMITTED
  → TRIGGER en pedidos: lee pago_en_curso = true
  → RAISE EXCEPTION → INSERT rechazado ✓
```

### Por qué `pago_en_curso = true` debe estar DENTRO del RPC

Actualmente `pago_en_curso = true` se escribe en el use case de Next.js **después** de que el RPC devuelve. Esto crea la ventana: User B se desbloquea cuando el RPC hace commit, pero en ese momento `pago_en_curso` todavía es false. El trigger lo leería como false y dejaría pasar el INSERT.

La corrección es mover ese UPDATE **dentro del RPC**, en la misma transacción que el FOR UPDATE. Así cuando el lock se libera, `pago_en_curso` ya es true y el trigger tiene el estado correcto.

---

## Estado actual del bloqueo

**El bloqueo `pago_en_curso` depende 100% de la capa de aplicación (Next.js)**. No existe ningún trigger ni RLS policy en la DB que verifique `pago_en_curso` antes de un INSERT en `pedidos`. Si el INSERT de User B llega a la DB, entra sin obstáculos.

---

## Implementación completa

### Pieza 1 — Trigger en `pedidos`

```sql
-- supabase/migrations/YYYYMMDD_trigger_prevent_order_during_payment.sql

CREATE OR REPLACE FUNCTION public.check_session_not_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM mesa_sesiones
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

CREATE TRIGGER prevent_order_during_payment
BEFORE INSERT ON pedidos
FOR EACH ROW
EXECUTE FUNCTION public.check_session_not_locked();
```

Este trigger es la capa de seguridad definitiva en la DB. Rechaza cualquier pedido que intente entrar mientras hay un pago activo, independientemente de lo que haga la capa de aplicación.

### Pieza 2 — RPC `initiate_mesa_payment_atomic`

```sql
-- supabase/migrations/YYYYMMDD_initiate_mesa_payment_atomic.sql

CREATE OR REPLACE FUNCTION public.initiate_mesa_payment_atomic(
  p_sesion_id            UUID,
  p_empresa_id           UUID,
  p_payment_order_ref    TEXT,
  p_expected_total_cents INT   -- 0 = skip check
)
RETURNS TABLE (
  status             TEXT,   -- 'ok' | 'total_mismatch' | 'no_orders'
  actual_total_cents INT,
  order_ids          UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
-- READ COMMITTED es suficiente y más performante con FOR UPDATE explícito.
AS $$
DECLARE
  v_total       NUMERIC := 0;
  v_total_cents INT;
  v_order_ids   UUID[];
BEGIN
  -- 1. Bloquear la fila padre de la sesión.
  --    Cualquier INSERT en pedidos con esta sesion_id quedará congelado
  --    mientras este lock esté activo (FK check necesita FOR KEY SHARE).
  PERFORM 1
  FROM mesa_sesiones
  WHERE id = p_sesion_id
  FOR UPDATE;

  -- 2. Lectura segura del total — ningún INSERT en vuelo puede colarse aquí.
  SELECT
    COALESCE(SUM(p.total), 0),
    ARRAY_AGG(p.id)
  INTO v_total, v_order_ids
  FROM pedidos p
  WHERE p.sesion_id = p_sesion_id
    AND p.empresa_id = p_empresa_id;

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) = 0 THEN
    RETURN QUERY SELECT 'no_orders'::TEXT, 0, '{}'::UUID[];
    RETURN;
  END IF;

  v_total_cents := ROUND(v_total * 100)::INT;

  -- 3. Validar total esperado.
  IF p_expected_total_cents > 0 AND ABS(v_total_cents - p_expected_total_cents) > 1 THEN
    RETURN QUERY SELECT 'total_mismatch'::TEXT, v_total_cents, v_order_ids;
    RETURN;
  END IF;

  -- 4. Marcar pedidos como pending.
  UPDATE pedidos
  SET
    payment_status       = 'pending',
    payment_order_ref    = CASE
      WHEN numero_pedido = (
        SELECT MAX(numero_pedido) FROM pedidos WHERE sesion_id = p_sesion_id
      ) THEN p_payment_order_ref
      ELSE payment_order_ref
    END,
    payment_amount_cents = CASE
      WHEN numero_pedido = (
        SELECT MAX(numero_pedido) FROM pedidos WHERE sesion_id = p_sesion_id
      ) THEN v_total_cents
      ELSE payment_amount_cents
    END
  WHERE sesion_id = p_sesion_id
    AND empresa_id = p_empresa_id;

  -- 5. Activar el lock DENTRO de la transacción.
  --    Crítico: pago_en_curso = true debe estar aquí, no en Next.js.
  --    Cuando el FOR UPDATE se libere al hacer commit, el trigger
  --    check_session_not_locked leerá pago_en_curso = true y rechazará
  --    cualquier INSERT de pedidos que estuviera esperando.
  UPDATE mesa_sesiones
  SET pago_en_curso    = true,
      pago_iniciado_en = now()
  WHERE id = p_sesion_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_total_cents, v_order_ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT) TO service_role;
```

### Pieza 3 — Cambios en `initiateRedsysMesaPaymentUseCase.ts`

Reemplazar el bloque completo de SELECT pedidos + UPDATE pedidos + UPDATE mesa_sesiones por una sola llamada al RPC:

```typescript
const { data: rpcResult, error: rpcError } = await supabase.rpc(
  'initiate_mesa_payment_atomic',
  {
    p_sesion_id:            sesionId,
    p_empresa_id:           input.empresaId,
    p_payment_order_ref:    paymentOrderRef,
    p_expected_total_cents: input.expectedTotalCents ?? 0,
  }
);

if (rpcError || !rpcResult || rpcResult.length === 0) {
  // handle DB error
}

const row = rpcResult[0] as { status: string; actual_total_cents: number };

if (row.status === 'no_orders') {
  return { success: false, error: { code: 'NOT_FOUND', message: 'No hay pedidos en la sesión activa', ... } };
}

if (row.status === 'total_mismatch') {
  return {
    success: false,
    error: {
      code: 'TOTAL_MISMATCH',
      message: JSON.stringify({ newTotalCents: row.actual_total_cents }),
      ...
    },
  };
}

// row.status === 'ok'
const amountCents = row.actual_total_cents;
// NOTA: NO hacer el UPDATE de pago_en_curso aquí — ya lo hizo el RPC.
// continuar con buildRedsysFormData(...)
```

---

### Pieza 4 — Capturar la excepción del trigger en el repositorio de pedidos

Este es el único punto delicado de la implementación. Actualmente `POST /api/pedidos` devuelve 423 gracias a un check JS que lee `pago_en_curso` antes del INSERT. Con el trigger en su lugar, si ese check JS se saltase (o si el timing es muy ajustado), el INSERT lanzará una excepción de Postgres con el mensaje `PAYMENT_IN_PROGRESS`.

Sin manejo explícito, Supabase devolvería un error genérico 500. Hay que capturarlo en el repositorio o en la route y mapearlo a 423:

```typescript
// En la route POST /api/pedidos (o en el repositorio de pedidos)
// donde se hace el INSERT a Supabase:

const { data, error } = await supabase
  .from('pedidos')
  .insert({ ... });

if (error) {
  // El trigger lanza PAYMENT_IN_PROGRESS cuando pago_en_curso=true
  if (error.message?.includes('PAYMENT_IN_PROGRESS')) {
    return NextResponse.json(
      { error: 'Hay un pago en curso en esta mesa.' },
      { status: 423 }
    );
  }
  // resto del manejo de errores existente
}
```

El check JS previo (`pago_en_curso`) puede mantenerse como primera capa (evita el round-trip a la DB en el caso normal). El trigger es la red de seguridad cuando el check JS no es suficiente por timing.

---

## Viabilidad

**Plan gratuito de Supabase**: completamente viable. Triggers, funciones PL/pgSQL, `SECURITY DEFINER`, `FOR UPDATE` y RPCs están disponibles en todos los planes sin restricciones. No hay ninguna feature de pago involucrada.

**Tamaño real**:

| Pieza | Líneas |
|-------|--------|
| Trigger + `check_session_not_locked` | ~15 líneas SQL |
| RPC `initiate_mesa_payment_atomic` | ~60 líneas PL/pgSQL |
| `initiateRedsysMesaPaymentUseCase.ts` | Reemplazar ~40 líneas por ~20 |
| Captura de `PAYMENT_IN_PROGRESS` en `POST /api/pedidos` | ~5 líneas TS |

No hay cambios de schema (ninguna tabla nueva ni columna nueva). Todo es aditivo excepto la simplificación del use case.

---

## Checklist de implementación

- [ ] Migración 1: `YYYYMMDD_trigger_prevent_order_during_payment.sql` — función + trigger BEFORE INSERT en pedidos
- [ ] Migración 2: `YYYYMMDD_initiate_mesa_payment_atomic.sql` — RPC con FOR UPDATE + SET pago_en_curso dentro de la transacción
- [ ] Actualizar `initiateRedsysMesaPaymentUseCase.ts`: reemplazar SELECT+UPDATE por RPC; eliminar el UPDATE de pago_en_curso posterior (ya lo hace el RPC)
- [ ] Actualizar `POST /api/pedidos`: capturar excepción `PAYMENT_IN_PROGRESS` del trigger y devolver 423
- [ ] Test concurrencia: `Promise.all([fetch('/api/pedidos'), fetch('/api/redsys/initiate-mesa')])` en staging — verificar que uno de los dos siempre falla con el error correcto

---

## Impacto estimado de la ventana actual

Para que el race condition actual se materialice:

1. User B debe estar enviando un pedido en el preciso instante en que User A adquiere el lock
2. El `INSERT` de B debe estar exactamente entre el `POST /lock` de A y el `SELECT pedidos` del use case
3. Esa ventana dura el tiempo de una llamada HTTP (red + Next.js + Supabase round-trip) — típicamente 50–200 ms

La probabilidad en un restaurante típico con 1–2 pedidos/minuto por mesa es prácticamente nula. En un restaurante de alta rotación podría aparecer raramente.

---

## Prerequisitos para implementar

- [ ] Supabase permite `SET default_transaction_isolation TO 'serializable'` en funciones `LANGUAGE plpgsql` — verificar en la versión activa de Postgres del proyecto
- [ ] Crear la migración `YYYYMMDD_initiate_mesa_payment_atomic.sql`
- [ ] Actualizar `initiateRedsysMesaPaymentUseCase.ts` para usar el RPC en el path de pago total (no aplica a división, que tiene su propio INSERT en `mesa_division_pagos` con `UNIQUE(payment_order_ref)`)
- [ ] Test: simular dos requests concurrentes con `Promise.all` en entorno de staging y verificar que el segundo siempre devuelve el total correcto
