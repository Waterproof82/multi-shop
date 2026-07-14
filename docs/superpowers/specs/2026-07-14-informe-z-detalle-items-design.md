# Informe Z + Desglose de Ítems en Ticket — Design Spec

**Fecha:** 2026-07-14
**Scope:** Cumplimiento RD 1619/2012 — Informe Z de cierre de turno y desglose de ítems en tickets individuales.
**Out of scope:** TicketBAI, impresión ESC/POS de Informe Z (se usa `window.print()`).

---

## 1. Contexto

El TPV ya tiene hash chaining, no-DELETE y audit trail atómico. Quedan dos requisitos del RD 1619/2012:

1. **Informe Z:** documento de cierre de turno con número secuencial, totales, IVA y hash del turno.
2. **Desglose de ítems:** cada ticket debe incluir nombre del producto, cantidad y precio unitario.

---

## 2. Informe Z

### 2.1 DB — `numero_z` en `tpv_turnos`

Nueva migración `20260714000003_tpv_numero_z.sql`:

```sql
ALTER TABLE public.tpv_turnos
  ADD COLUMN IF NOT EXISTS numero_z BIGINT;

-- Trigger BEFORE UPDATE: asigna el siguiente numero_z al cerrar el turno.
-- Corre antes de tpv_turno_no_update_fields (orden alfabético: 'a' < 'n').
-- numero_z no es un campo protegido de apertura, así que la inmutabilidad
-- post-cierre queda cubierta por la regla OLD.cierre_at IS NOT NULL.
CREATE OR REPLACE FUNCTION tpv_turno_assign_numero_z()
RETURNS TRIGGER AS $$
DECLARE
  next_z BIGINT;
BEGIN
  IF OLD.cierre_at IS NULL AND NEW.cierre_at IS NOT NULL AND NEW.numero_z IS NULL THEN
    SELECT COALESCE(MAX(numero_z), 0) + 1
      INTO next_z
      FROM public.tpv_turnos
     WHERE empresa_id = NEW.empresa_id
       FOR UPDATE;
    NEW.numero_z := next_z;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tpv_turno_assign_z
  BEFORE UPDATE ON public.tpv_turnos
  FOR EACH ROW EXECUTE FUNCTION tpv_turno_assign_numero_z();
```

El trigger se llama `tpv_turno_assign_z` → orden alfabético garantiza que corre ANTES de `tpv_turno_no_update_fields`. El campo `numero_z` no está en la lista de campos de apertura protegidos, por lo que el segundo trigger no lo bloquea. Una vez cerrado, la regla `OLD.cierre_at IS NOT NULL` congela `numero_z` automáticamente.

### 2.2 Tipos de dominio — `InformeZData`

Nuevo tipo en `tpv-types.ts`:

```typescript
export interface InformeZDesglosePago {
  metodoPago: MetodoPago;
  totalCents: number;
  numOperaciones: number;
}

export interface InformeZData {
  // Turno
  turnoId: string;
  numeroZ: number;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string;
  hashEncadenado: string;
  // Empresa
  empresaNombre: string;
  empresaNif: string | null;
  tipoImpuesto: TipoImpuesto;
  // Totales del turno
  efectivoAperturaCents: number;
  efectivoCierreCents: number;
  efectivoCierreTeoricoCents: number;
  diferenciaCents: number;
  // Agregados de cobros
  totalFacturadoCents: number;
  baseImponibleCents: number;
  ivaCents: number;
  propinaCents: number;
  numCobros: number;
  desglosePagos: InformeZDesglosePago[];
  // Movimientos de caja del turno (para el Z)
  movimientos: TpvTurnoEvento[];
}
```

### 2.3 Repositorio — `getInformeZ`

Nuevo método en `ITpvRepository`:

```typescript
getInformeZ(turnoId: string, empresaId: string): Promise<Result<InformeZData>>;
```

La implementación en `SupabaseTpvRepository` ejecuta tres queries en paralelo:
1. `tpv_turnos` JOIN `empresas` (nombre, nif, tipo_impuesto, porcentaje_impuesto)
2. `tpv_cobros` WHERE `turno_id = turnoId` → agrega `SUM(base_imponible_cents)`, `SUM(iva_cents)`, `SUM(propina_cents)`, `COUNT(*)`, y group by `metodo_pago`
3. `tpv_turno_eventos` WHERE `turno_id = turnoId`

### 2.4 API — `GET /api/tpv/turno/[id]/informe-z`

Archivo: `src/app/api/tpv/turno/[id]/informe-z/route.ts`

- Auth: cualquier rol TPV (`cajero`, `encargado`, `admin`, `superadmin`)
- Verifica que el turno pertenece a la empresa del token (`empresaId`)
- Devuelve `InformeZData`

### 2.5 UI — Flujo de cierre con Informe Z

**`TurnoCerrarForm`** (modificar):

Estado actual: al cerrar con éxito → `router.push('/tpv')`.

Estado nuevo:
```
'idle' → 'loading' → 'informe-z' → (usuario pulsa "Finalizar") → router.push('/tpv')
```

Al recibir éxito del cierre: fetch `GET /api/tpv/turno/:turnoId/informe-z` → guardar `informeZ: InformeZData` en state → mostrar `<InformeZModal>`.

**`InformeZModal`** (nuevo componente en `src/components/tpv/InformeZModal.tsx`):

- Client component
- Renderiza el Informe Z completo con CSS `@media print` (sin header/botones en impresión)
- `useEffect` con `setTimeout(window.print, 400)` al montar — da tiempo al DOM a renderizar antes de abrir el diálogo de impresión
- Electron intercepta `window.print()` vía el IPC existente y lo envía a la impresora configurada
- Botón "Finalizar turno" que llama `onClose` (el form entonces hace `router.push('/tpv')`)

**Contenido del Informe Z** (según RD 1619/2012):
```
[NOMBRE EMPRESA]                  [NIF]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          INFORME Z Nº XXXXX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Apertura:  DD/MM/AAAA HH:MM
Cierre:    DD/MM/AAAA HH:MM
Operador:  [nombre]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VENTAS
  Efectivo:          XX,XX €
  Tarjeta:           XX,XX €
  Nº operaciones:    XX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FISCALIDAD ([IVA/IGIC] X%)
  Base imponible:    XX,XX €
  Cuota [IVA/IGIC]:  XX,XX €
  Propinas (exento): XX,XX €
  TOTAL:             XX,XX €
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARQUEO DE CAJA
  Fondo apertura:    XX,XX €
  [Movimientos de caja si los hay]
  Efectivo teórico:  XX,XX €
  Efectivo contado:  XX,XX €
  Descuadre:         XX,XX €
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUELLA DIGITAL
[hash_encadenado en bloques de 16]
```

---

## 3. Desglose de Ítems en Ticket

### 3.1 DB — `detalle_items` en `tpv_cobros`

Añadida a migración `20260714000003_tpv_numero_z.sql` (misma migración, sección separada):

```sql
ALTER TABLE public.tpv_cobros
  ADD COLUMN IF NOT EXISTS detalle_items JSONB;

-- Extender el trigger no-update para proteger también detalle_items
-- (ya que el trigger comprueba campos específicos)
```

El trigger `tpv_cobro_block_update` actual protege: `numero_ticket`, `importe_cobrado_cents`, `metodo_pago`, `hash`, `empresa_id`. Se añade `detalle_items` a esa lista.

Estructura JSONB:
```json
[
  { "nombre": "Paella valenciana", "cantidad": 2, "precioUnitarioCents": 1250 },
  { "nombre": "Agua mineral",      "cantidad": 1, "precioUnitarioCents":  200 }
]
```

### 3.2 Tipos — `TpvDetalleItem`

```typescript
// tpv-types.ts
export interface TpvDetalleItem {
  nombre: string;
  cantidad: number;
  precioUnitarioCents: number;
}
```

Añadir a `TpvCobro`:
```typescript
detalleItems: TpvDetalleItem[] | null;
```

Añadir a `TpvCobroCompletoPayload`:
```typescript
detalleItems?: TpvDetalleItem[];
```

### 3.3 Cobros de mesa — auto-populated en el servidor

Ruta `/api/tpv/cobro` (mesa flow): al procesar el cobro, el servidor fetcha los pedidos de la sesión y construye `detalle_items` automáticamente antes de llamar `crearCobroCompleto`.

Query:
```sql
SELECT detalle_pedido FROM pedidos
WHERE sesion_id = $sesionId AND estado != 'cancelado'
```

Cada `detalle_pedido` es un array JSONB con campos `nombre`, `precio`, `cantidad`. El servidor agrega por nombre (suma cantidades) y convierte `precio` a céntimos.

Función de agregación (TypeScript, en la ruta):
```typescript
function buildDetalleItems(pedidos: RawPedido[]): TpvDetalleItem[] {
  const map = new Map<string, { cantidad: number; precioUnitarioCents: number }>();
  for (const pedido of pedidos) {
    for (const item of pedido.detalle_pedido ?? []) {
      const key = item.nombre ?? '';
      const prev = map.get(key) ?? { cantidad: 0, precioUnitarioCents: Math.round((item.precio ?? 0) * 100) };
      map.set(key, { ...prev, cantidad: prev.cantidad + (item.cantidad ?? 1) });
    }
  }
  return Array.from(map.entries()).map(([nombre, v]) => ({ nombre, ...v }));
}
```

### 3.4 Cobros de mostrador — enviados desde el cliente

`MostradorClient` ya tiene el carrito en memoria como `ExistingOrder[].items`. Al crear el cobro (vía `crearCobroCompleto`), incluye los items del carrito como `detalleItems`.

El schema Zod del endpoint `crearCobroCompleto` acepta el campo opcional:
```typescript
detalleItems: z.array(z.object({
  nombre: z.string().max(200),
  cantidad: z.number().int().positive(),
  precioUnitarioCents: z.number().int().min(0),
})).optional(),
```

### 3.5 Visualización en `CobroConfirmado`

`CobroConfirmado` ya renderiza el ticket de confirmación y la URL AEAT. Se añade una sección de líneas de ítem si `cobro.detalleItems` no es null:

```
Mesa 4                    DD/MM/AAAA HH:MM
────────────────────────────────────────
2x Paella valenciana              25,00 €
1x Agua mineral                    2,00 €
────────────────────────────────────────
Base imponible:                   24,55 €
IVA 10%:                           2,45 €
TOTAL:                            27,00 €
Método:  Efectivo
Ticket:  T-000042
```

---

## 4. Archivos afectados

```
MIGRATIONS
  supabase/migrations/20260714000003_tpv_numero_z_detalle_items.sql  (NEW)

DOMAIN
  src/core/domain/entities/tpv-types.ts                              (MODIFY)
  src/core/domain/repositories/ITpvRepository.ts                     (MODIFY)

INFRASTRUCTURE
  src/core/infrastructure/repositories/supabase-tpv.repository.ts   (MODIFY)

API ROUTES
  src/app/api/tpv/turno/[id]/informe-z/route.ts                     (NEW)
  src/app/api/tpv/cobro/route.ts                                     (MODIFY — auto detalle_items)
  src/app/api/tpv/cobro/rectificar/route.ts                         (MODIFY — pass detalle_items from original cobro)

COMPONENTS
  src/components/tpv/InformeZModal.tsx                               (NEW)
  src/components/tpv/TurnoCerrarForm.tsx                             (MODIFY)
  src/components/tpv/cobro/CobroConfirmado.tsx                       (MODIFY)
  src/components/tpv/MostradorClient.tsx                             (MODIFY — pass detalleItems)

DOCS
  docs/tpv-legal-compliance.md                                       (MODIFY)
```

---

## 5. Decisiones de diseño

| Decisión | Razón |
|---|---|
| `numero_z` asignado en trigger BEFORE UPDATE | Atómico con el cierre. Sin race conditions. |
| `detalle_items` en `tpv_cobros` — no en tabla separada | Inmutabilidad garantizada por el trigger existente. Un solo SELECT para recuperar el ticket completo. |
| Items de mesa agregados server-side | El cliente no conoce todos los pedidos. El servidor tiene la fuente de verdad. |
| Items de mostrador enviados por el cliente | No hay sesión persistida. El carrito solo vive en el cliente. |
| Informe Z vía `window.print()` | Electron lo intercepta; browser muestra diálogo nativo. Soporta layout complejo sin ESC/POS manual. |
| Informe Z mostrado en modal antes de redirigir | El encargado debe poder releerlo y confirmar antes de salir de la pantalla de cierre. |
| `rectificar` hereda `detalle_items` del cobro original | La rectificativa anula el ticket original — coherente mostrar los mismos ítems con signo negativo. |
