# TPV — Informe Z y Desglose de Ítems en Ticket

Implementación de los dos requisitos fiscales pendientes del RD 1619/2012 para el TPV de hostelería.

---

## 1. Informe Z (cierre de turno)

### Qué es

Documento fiscal que se genera al cerrar cada turno de caja. Contiene totales de ventas, desglose por método de pago, IVA/IGIC, arqueo de caja y la huella digital del turno (`hash_encadenado`). Lleva un número secuencial por empresa (`numero_z`) que garantiza ausencia de saltos.

### `numero_z` en `tpv_turnos`

Columna `BIGINT` añadida en la migración `20260714000003`. Se asigna automáticamente mediante un trigger BEFORE UPDATE en PostgreSQL:

- Trigger: `tpv_turno_assign_z` (función `tpv_turno_assign_numero_z`)
- Condición: `OLD.cierre_at IS NULL AND NEW.cierre_at IS NOT NULL AND NEW.numero_z IS NULL`
- Secuencia: `COALESCE(MAX(numero_z), 0) + 1` por `empresa_id`, protegido con `pg_advisory_xact_lock` para serializar asignaciones concurrentes (cubre incluso el caso de zero rows)
- Orden de triggers: el nombre `tpv_turno_assign_z` precede alfabéticamente a `tpv_turno_no_update_fields`, garantizando que `numero_z` se asigna ANTES de que el segundo trigger congele el registro

### API

`GET /api/tpv/turno/[id]/informe-z`

- Auth: cualquier rol TPV (`cajero`, `encargado`, `admin`, `superadmin`)
- Verifica que el turno pertenece a la empresa del token (tenant isolation)
- Ejecuta 3 queries en paralelo:
  1. `tpv_turnos` JOIN `empresas` (nombre, nif, tipo_impuesto)
  2. `tpv_cobros` WHERE `turno_id` — agrega totales y desglosa por `metodo_pago`
  3. `tpv_turno_eventos` WHERE `turno_id` — movimientos de caja
- Devuelve `InformeZData`

### Tipos de dominio

```typescript
// src/core/domain/entities/tpv-types.ts

export interface InformeZDesglosePago {
  metodoPago: MetodoPago;
  totalCents: number;
  numOperaciones: number;
}

export interface InformeZData {
  turnoId: string;
  numeroZ: number;
  operadorNombre: string;
  aperturaAt: string;
  cierreAt: string;
  hashEncadenado: string;
  empresaNombre: string;
  empresaNif: string | null;
  tipoImpuesto: TipoImpuesto;
  efectivoAperturaCents: number;
  efectivoCierreCents: number;
  efectivoCierreTeoricoCents: number;
  diferenciaCents: number;
  totalFacturadoCents: number;
  baseImponibleCents: number;
  ivaCents: number;
  propinaCents: number;
  numCobros: number;
  desglosePagos: InformeZDesglosePago[];
  movimientos: TpvTurnoEvento[];
}
```

### Flujo de cierre en UI

```
TurnoCerrarForm
  idle → loading (POST /api/tpv/turno/:id/cerrar)
    → setTurno(null)  // limpia el turno del contexto
    → GET /api/tpv/turno/:id/informe-z
    → informe-z (muestra InformeZModal con auto-print)
    → usuario pulsa "Finalizar turno"
    → router.push('/tpv/turno/abrir')
```

Si el fetch del Informe Z falla, se redirige directamente sin bloquear al operador.

### `InformeZModal`

`src/components/tpv/InformeZModal.tsx`

- `'use client'` component
- `useEffect` con `setTimeout(window.print, 400)` — abre el diálogo de impresión nativo a los 400ms del montaje, dando tiempo al DOM a renderizar
- Tailwind `print:hidden` oculta botones e interfaz en impresión
- Electron intercepta `window.print()` vía el IPC existente y lo redirige a la impresora térmica configurada
- Botón "Finalizar turno" llama `onClose`, que hace `router.push('/tpv/turno/abrir')`

### Contenido del Informe Z

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
  N operaciones:     XX
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
  Efectivo teorico:  XX,XX €
  Efectivo contado:  XX,XX €
  Descuadre:         XX,XX €
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HUELLA DIGITAL
[hash_encadenado en bloques de 16]
```

---

## 2. Desglose de Ítems en Ticket (`detalle_items`)

### Qué es

El RD 1619/2012 exige que cada ticket incluya nombre del producto, cantidad y precio unitario. Se implementa como columna `detalle_items JSONB` en `tpv_cobros`, inmutable una vez grabada.

### Estructura JSONB

```json
[
  { "nombre": "Paella valenciana", "cantidad": 2, "precioUnitarioCents": 1250 },
  { "nombre": "Agua mineral",      "cantidad": 1, "precioUnitarioCents":  200 }
]
```

### Tipo de dominio

```typescript
export interface TpvDetalleItem {
  nombre: string;
  cantidad: number;
  precioUnitarioCents: number;
}

// TpvCobro ahora incluye:
detalleItems: TpvDetalleItem[] | null;
```

### Inmutabilidad

El trigger `tpv_cobro_block_update` fue extendido para proteger `detalle_items` usando `IS DISTINCT FROM` (NULL-safe, necesario porque la columna es nullable):

```sql
OLD.detalle_items IS DISTINCT FROM NEW.detalle_items
```

Si alguien intenta modificar `detalle_items` después de grabar el cobro, el trigger lanza EXCEPTION.

### Cómo se popula

#### Cobros de mesa (auto-servidor)

El servidor construye `detalle_items` automáticamente al procesar el cobro en `POST /api/tpv/cobro`:

1. Detecta que hay `sesionId` en el body
2. Fetcha `pedidos` WHERE `sesion_id = sesionId AND estado != 'cancelado'`
3. Agrega los ítems con `buildDetalleItems()`:

```typescript
function buildDetalleItems(pedidos: RawPedido[]): TpvDetalleItem[] {
  const map = new Map<string, { nombre: string; cantidad: number; precioUnitarioCents: number }>();
  for (const pedido of pedidos) {
    for (const item of pedido.detalle_pedido ?? []) {
      const nombre = item.nombre ?? '';
      const precioUnitarioCents = Math.round((item.precio ?? 0) * 100);
      const key = `${nombre}|${precioUnitarioCents}`; // clave compuesta: mismo nombre a distintos precios = lineas separadas
      const prev = map.get(key) ?? { nombre, cantidad: 0, precioUnitarioCents };
      map.set(key, { ...prev, cantidad: prev.cantidad + (item.cantidad ?? 1) });
    }
  }
  return Array.from(map.values());
}
```

La clave compuesta `nombre|precio` garantiza que dos variantes del mismo producto a distinto precio aparecen como lineas separadas en el ticket.

#### Cobros de mostrador (enviados por cliente)

`MostradorClient` envía los items del carrito directamente en el body del cobro como `detalleItems`. No hay sesion persistida en el servidor — el carrito solo vive en el cliente.

#### Tickets rectificativos

El rectificativo hereda `detalle_items` del cobro original. Esto garantiza coherencia: el ticket de anulacion muestra los mismos items que el ticket que anula.

### Visualización en `CobroConfirmado`

Cuando `cobro.detalleItems` no es null, se muestra una seccion de lineas de item antes del desglose de IVA:

```
Mesa 4                    DD/MM/AAAA HH:MM
────────────────────────────────────────
2x Paella valenciana              25,00 €
1x Agua mineral                    2,00 €
────────────────────────────────────────
Base imponible:                   24,55 €
IVA 10%:                           2,45 €
TOTAL:                            27,00 €
Metodo:  Efectivo
Ticket:  T-000042
```

---

## 3. Archivos afectados

| Archivo | Tipo | Descripcion |
|---------|------|-------------|
| `supabase/migrations/20260714000003_tpv_numero_z_detalle_items.sql` | NEW | Columnas + triggers |
| `src/core/domain/entities/tpv-types.ts` | MODIFY | Nuevos tipos: `TpvDetalleItem`, `InformeZDesglosePago`, `InformeZData`; extendido `TpvCobro` |
| `src/core/domain/repositories/ITpvRepository.ts` | MODIFY | Metodo `getInformeZ` |
| `src/core/infrastructure/repositories/supabase-tpv.repository.ts` | MODIFY | Impl `getInformeZ` + `detalle_items` en `crearCobroCompleto` |
| `src/core/application/use-cases/tpv/registrar-cobro.use-case.ts` | MODIFY | Pass-through de `detalleItems` |
| `src/app/api/tpv/cobro/route.ts` | MODIFY | `buildDetalleItems()` + auto-fetch de pedidos |
| `src/app/api/tpv/cobro/rectificar/route.ts` | MODIFY | Hereda `detalle_items` del original |
| `src/app/api/tpv/turno/[id]/informe-z/route.ts` | NEW | GET Informe Z |
| `src/components/tpv/InformeZModal.tsx` | NEW | Modal con auto-print |
| `src/components/tpv/TurnoCerrarForm.tsx` | MODIFY | Fetch + mostrar modal antes de redirigir |
| `src/components/tpv/cobro/CobroConfirmado.tsx` | MODIFY | Seccion de lineas de item |

---

## 4. Decisiones de diseno

| Decision | Razon |
|----------|-------|
| `numero_z` asignado en trigger BEFORE UPDATE | Atomico con el cierre. Sin race conditions. |
| `pg_advisory_xact_lock` para serializar Z | `FOR UPDATE` en un agregado no protege el caso de zero rows (primera empresa). El advisory lock serializa cualquier escenario. |
| `detalle_items` en `tpv_cobros`, no tabla separada | Inmutabilidad garantizada por el trigger existente. Un solo SELECT recupera el ticket completo. |
| Clave compuesta `nombre|precio` en `buildDetalleItems` | Evita que variantes del mismo producto a distinto precio se colapsen en una linea con precio incorrecto. |
| Items de mesa agregados server-side | El cliente TPV no conoce todos los pedidos de la sesion. El servidor tiene la fuente de verdad. |
| Items de mostrador enviados por el cliente | No hay sesion persistida. El carrito solo vive en el cliente. |
| Informe Z via `window.print()` | Electron lo intercepta; el browser muestra dialogo nativo. Soporta layout complejo sin ESC/POS manual. |
| Modal antes de redirigir | El encargado debe poder releer y confirmar el Z antes de salir de la pantalla de cierre. Si el fetch del Z falla, se redirige igualmente para no bloquear. |
| Rectificativa hereda `detalle_items` | La rectificativa anula el ticket original — coherente mostrar los mismos items con signo negativo. |
