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

## Solución definitiva: RPC Postgres con aislamiento SERIALIZABLE

La única forma de eliminar el race condition al 100% es hacer el SELECT de pedidos, la validación del total y la escritura del `payment_order_ref` en una **sola transacción atómica con aislamiento SERIALIZABLE** dentro de Postgres. Esto garantiza que ningún INSERT concurrente en `pedidos` puede esconderse entre el SELECT y el write.

### Migración SQL

```sql
-- supabase/migrations/YYYYMMDD_initiate_mesa_payment_atomic.sql

CREATE OR REPLACE FUNCTION public.initiate_mesa_payment_atomic(
  p_sesion_id           UUID,
  p_empresa_id          UUID,
  p_payment_order_ref   TEXT,
  p_expected_total_cents INT  -- 0 = skip check (division shares no necesitan esto)
)
RETURNS TABLE (
  status           TEXT,    -- 'ok' | 'total_mismatch' | 'no_orders'
  actual_total_cents INT,
  order_ids        UUID[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET default_transaction_isolation TO 'serializable'
AS $$
DECLARE
  v_total          NUMERIC := 0;
  v_total_cents    INT;
  v_order_ids      UUID[];
BEGIN
  -- Lock all pedidos of this session for the duration of the transaction.
  -- SERIALIZABLE + FOR UPDATE prevents any concurrent INSERT from slipping through.
  SELECT
    COALESCE(SUM(p.total), 0),
    ARRAY_AGG(p.id)
  INTO v_total, v_order_ids
  FROM pedidos p
  WHERE p.sesion_id = p_sesion_id
    AND p.empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_order_ids IS NULL OR array_length(v_order_ids, 1) = 0 THEN
    RETURN QUERY SELECT 'no_orders'::TEXT, 0, '{}'::UUID[];
    RETURN;
  END IF;

  v_total_cents := ROUND(v_total * 100)::INT;

  -- Total mismatch check (skip if expected = 0)
  IF p_expected_total_cents > 0 AND ABS(v_total_cents - p_expected_total_cents) > 1 THEN
    RETURN QUERY SELECT 'total_mismatch'::TEXT, v_total_cents, v_order_ids;
    RETURN;
  END IF;

  -- Mark all pedidos as pending and set anchor payment_order_ref atomically
  UPDATE pedidos
  SET
    payment_status    = 'pending',
    payment_order_ref = CASE
      WHEN numero_pedido = (SELECT MAX(numero_pedido) FROM pedidos WHERE sesion_id = p_sesion_id)
      THEN p_payment_order_ref
      ELSE payment_order_ref
    END,
    payment_amount_cents = CASE
      WHEN numero_pedido = (SELECT MAX(numero_pedido) FROM pedidos WHERE sesion_id = p_sesion_id)
      THEN v_total_cents
      ELSE payment_amount_cents
    END
  WHERE sesion_id = p_sesion_id
    AND empresa_id = p_empresa_id;

  RETURN QUERY SELECT 'ok'::TEXT, v_total_cents, v_order_ids;
END;
$$;

-- service_role necesita ejecutar esta función
GRANT EXECUTE ON FUNCTION public.initiate_mesa_payment_atomic(UUID, UUID, TEXT, INT) TO service_role;
```

### Cambios en el use case

Reemplazar los dos `UPDATE pedidos` separados más el `SELECT pedidos` por una sola llamada al RPC:

```typescript
// En initiateRedsysMesaPaymentUseCase.ts — reemplazar el bloque de pedidos

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
// continuar con buildRedsysFormData(...)
```

### Por qué funciona

`SERIALIZABLE` + `FOR UPDATE` sobre los pedidos de la sesión hace que Postgres serialice todos los accesos concurrentes a esas filas. Cualquier `INSERT` de un nuevo pedido en la misma sesión que llegue concurrentemente:

- Si llegó antes de que el RPC abra la transacción: queda incluido en el SELECT ✓
- Si llega durante la transacción: espera a que se libere el lock ✓
- Si llega después: la sesión ya tiene `pago_en_curso=true`, el pedido se rechaza con 423 ✓

No puede existir ninguna ventana entre el SELECT y el UPDATE.

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
