# Stock & Mermas — Sistema de Inventario TPV

## Propósito

Control de inventario a nivel de ingrediente integrado en el TPV. Cuando un ítem se marca como servido, el stock se descuenta automáticamente vía trigger de base de datos. Si un ingrediente cae por debajo del umbral, el producto se desactiva del menú. El operador puede registrar mermas durante el turno.

---

## Rutas

| Ruta | Tipo | Descripción |
|------|------|-------------|
| `/admin/stock/ingredientes` | Admin UI | CRUD de ingredientes con badge de stock (rojo/verde) |
| `/admin/stock/recetas` | Admin UI | Editor de escandallo: selector de producto + filas ingrediente + cantidad |
| `/admin/stock/movimientos` | Admin UI | Audit log paginado con filtros por ingrediente, tipo y fecha |
| `/tpv/mermas` | TPV UI | Registro de merma por turno activo (operador + motivo + cantidad) |

---

## API Routes

| Método | Path | Auth | Notas |
|--------|------|------|-------|
| GET/POST | `/api/admin/stock/ingredientes` | admin | Lista + crear |
| GET/PUT/DELETE | `/api/admin/stock/ingredientes/[id]` | admin | PUT NO acepta cantidadActual (solo nombre/unidad/umbral) |
| POST | `/api/admin/stock/ingredientes/[id]/ajuste` | admin | Delta positivo o negativo; dispara re-habilitación de productos |
| GET/PUT | `/api/admin/stock/recetas/[productoId]` | admin | PUT = replace total (no merge) |
| GET | `/api/admin/stock/movimientos` | admin | Paginado, filtrable |
| GET | `/api/admin/stock/mermas` | admin | Filtrable por turnoId |
| POST | `/api/tpv/stock/mermas` | admin | Registro de merma con turnoId |
| GET | `/api/tpv/stock/alerts` | admin | Ingredientes bajo umbral (para LowStockBadge) |

---

## Capas

```
stock-types.ts          → Ingrediente, RecetaItem, MovimientoStock, Merma, payloads
IStockRepository.ts     → Interfaz completa (ingredientes, recetas, movimientos, mermas, alerts, rehabilitarProductos)
supabase-stock.repository.ts → Implementación con getSupabaseClient(), Result<T>
use-cases/stock/
  registrar-merma.use-case.ts   → Valida cantidad > 0 y operadorNombre no vacío
  ajustar-stock.use-case.ts     → Atomic delta + audit + re-habilita productos si delta > 0
  get-low-stock-alerts.use-case.ts → Filter en memoria (supabase-js no soporta col-to-col)
```

---

## Migraciones (orden obligatorio)

| Archivo | Crea |
|---------|------|
| `20260706000001_stock_ingredientes.sql` | ENUM `unidad_medida`, tablas `ingredientes` + `receta_items`, RLS, GRANTs |
| `20260706000002_stock_movimientos_mermas.sql` | ENUMs `tipo_movimiento` + `motivo_merma`, tablas `movimientos_stock` + `mermas`, RLS, GRANTs |
| `20260706000003_stock_deduccion_trigger.sql` | Trigger `deducir_stock_on_servido` + RPC `stock_update_cantidad` |
| `20260706000004_stock_sin_receta.sql` | Añade `sin_receta` a `tipo_movimiento`; hace `ingrediente_id` nullable en `movimientos_stock` |

---

## Trigger `deducir_stock_on_servido`

- Fires: `AFTER INSERT OR UPDATE ON pedido_item_estados` (guard interno: solo si `estado = 'servido'`)
- Resuelve `producto_id` desde `pedidos.detalle_pedido->item_idx->>'producto_id'` (JSONB)
- Por cada `receta_item`: decrementa `cantidad_actual` atómicamente + inserta `movimientos_stock` (tipo=`deduccion`)
- Si `cantidad_actual < umbral_alerta`: `UPDATE productos SET activo = false` para todos los productos que usen ese ingrediente
- Si el producto no tiene receta: inserta fila `sin_receta` con `ingrediente_id = NULL` para trazabilidad

**Columna en productos es `activo` (no `disponible`).**

---

## Re-habilitación de productos

Cuando admin hace un ajuste positivo desde `/api/admin/stock/ingredientes/[id]/ajuste`:
1. `ajustarStockUseCase` llama `repo.updateCantidad()` (atómico via RPC)
2. Si `delta > 0` y `cantidadActual >= umbralAlerta`: llama `repo.rehabilitarProductos(ingredienteId)`
3. `rehabilitarProductos` busca `receta_items` del ingrediente → `UPDATE productos SET activo = true WHERE activo = false`

**Nota**: consistente con el trigger — solo evalúa el ingrediente que cambió. Un producto con múltiples ingredientes en alerta puede reactivarse antes de tiempo, pero el trigger lo desactivará en el siguiente servicio.

---

## `movimientos_stock` — Tipos de movimiento

| tipo | Quién lo genera | ingrediente_id |
|------|-----------------|----------------|
| `deduccion` | Trigger (ítem servido) | NOT NULL |
| `merma` | `registrarMermaUseCase` | NOT NULL |
| `ajuste` | `ajustarStockUseCase` | NOT NULL |
| `entrada` | `ajustarStockUseCase` | NOT NULL |
| `sin_receta` | Trigger (producto sin receta) | NULL |

`movimientos_stock` es append-only para `authenticated`. No UPDATE ni DELETE.

---

## LowStockBadge

Componente `src/components/tpv/LowStockBadge.tsx`:
- Fetchea `GET /api/tpv/stock/alerts` al montar y cada 3 minutos
- Si hay alertas: badge ámbar clicable con modal de detalle (nombre, cantidad actual, umbral)
- Si no hay alertas: renderiza `null`
- Montado en `TpvHeader` (visible en todo el TPV) y en `CobroMetodoPropina` (pantalla de cobro)
- Fetch silently fails — nunca bloquea UI

---

## Trampas conocidas

- **`ingrediente_id` nullable**: desde migration 4, `movimientos_stock.ingrediente_id` puede ser NULL (filas `sin_receta`). Cualquier código que lea la tabla debe manejar null → `'—'` en UI, `(row.ingrediente_id as string) ?? null` en mapper.
- **`replaceReceta` es destructiva**: PUT en `/api/admin/stock/recetas/[productoId]` borra todos los items existentes y los reinserta. El cliente debe enviar la lista completa.
- **`findLowStockAlerts` filtra en memoria**: supabase-js no soporta `WHERE cantidad_actual < umbral_alerta` (col-to-col). Se traen todos los ingredientes con `umbral_alerta > 0` y se filtra en JS.
- **`cantidadActual` nunca por PUT**: la ruta `PUT /api/admin/stock/ingredientes/[id]` ignora `cantidadActual`. Las modificaciones de cantidad van por `/ajuste` (entrada/ajuste) o `/mermas` (merma).
- **Sidebar stock**: `requiresRestaurant: true` en los tres ítems — solo aparece para empresas de tipo restaurante.
