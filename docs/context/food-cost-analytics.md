# Food Cost Analytics — Contexto

> Bloque 2 implementado en `main` el 2026-07-16.

## Qué hace este módulo

Dos páginas de analítica en el panel admin para restaurantes:

| Página | Ruta | Qué muestra |
|--------|------|-------------|
| Food Cost Teórico vs Real | `/admin/analytics/food-cost` | Coste teórico (escandallo × CMP) frente al coste real de compras en el período. Incluye aviso si hay productos sin receta o ingredientes sin CMP. |
| Rentabilidad por Producto | `/admin/analytics/rentabilidad` | Tabla ordenable de todos los productos: precio de venta, coste de receta, margen bruto, margen %, unidades vendidas y contribución total al período. |

## CMP — Coste Medio Ponderado

El CMP es el precio unitario de cada ingrediente, calculado como media ponderada de todas las compras históricas.

### Fórmula

```
CMP_nuevo = (CMP_anterior × qty_anterior + precio_entrada × qty_nueva) / (qty_anterior + qty_nueva)
```

### Dónde vive

- `ingredientes.precio_cmp_cents INTEGER NOT NULL DEFAULT 0` — valor actual del CMP en céntimos/unidad
- `movimientos_stock.precio_unitario_cmp_cents INTEGER` — precio de compra en el momento del movimiento (nullable; solo se rellena en entradas de compra, `NULL` en ajustes/mermas/inventario)

### Cómo se actualiza

Trigger `trigger_fn_recalcular_cmp` — `BEFORE INSERT ON movimientos_stock`:

- Solo actúa si `NEW.precio_unitario_cmp_cents IS NOT NULL` (i.e., movimientos de compra)
- Si `qty_anterior + qty_nueva <= 0`: CMP = precio de compra (evita división por cero con stock negativo)
- Si `qty_anterior <= 0` o `CMP_anterior = 0`: CMP = precio de compra (arranque desde cero)
- En cualquier otro caso: aplica la fórmula ponderada

## Tablas y columnas nuevas (migración `20260715000003_food_cost_analytics.sql`)

| Objeto | Tipo | Descripción |
|--------|------|-------------|
| `ingredientes.precio_cmp_cents` | COLUMN | CMP actual en céntimos/unidad |
| `movimientos_stock.precio_unitario_cmp_cents` | COLUMN | Precio unitario de la compra que genera el movimiento |
| `idx_pedidos_detalle_pedido_gin` | INDEX GIN | Accelera el JSONB `@>` scan de `pedidos.detalle_pedido` en los RPCs |
| `analytics_food_cost_teorico(p_empresa_id, p_desde, p_hasta)` | RPC | Food cost teórico por producto |
| `analytics_food_cost_real(p_empresa_id, p_desde, p_hasta)` | RPC | Coste real de compras desde albaranes recibidos |
| `analytics_margen_productos(p_empresa_id, p_desde, p_hasta)` | RPC | Margen por producto (universo completo, LEFT JOIN) |
| `trigger_fn_recalcular_cmp` | TRIGGER FN | BEFORE INSERT en `movimientos_stock`, actualiza `precio_cmp_cents` |

## RPCs

### `analytics_food_cost_teorico`

Dos CTEs separados para evitar inflación geométrica de costes:

1. `costes_unitarios` — suma `ri.cantidad_necesaria × i.precio_cmp_cents` por producto (sin ventas)
2. `ventas_agrupadas` — suma unidades vendidas por `producto_id` desde `pedidos.detalle_pedido` JSONB (sin recetas)

Luego JOIN entre ambas CTEs. Incluye `items_sin_producto` (ítems en JSONB sin `producto_id` válido).

### `analytics_margen_productos`

`universo_productos` CTE arranca con TODOS los productos del tenant (sin filtrar por receta). LEFT JOIN posterior con `costes_receta` y `ventas_periodo`. Garantiza R6: productos sin receta (botellas, latas) aparecen con `coste_receta_cents = 0`.

### `analytics_food_cost_real`

Agrega coste de compras desde `albaranes_compra_items` JOIN `albaranes_compra` WHERE `estado = 'recibido'` dentro del período. Devuelve coste total real en céntimos.

## Arquitectura de capas

```
DB RPC → IAnalyticsRepository → AnalyticsUseCase → API Route → React Page
```

| Capa | Archivo |
|------|---------|
| Dominio — tipos | `src/core/domain/entities/analytics-types.ts` |
| Dominio — interfaz repo | `src/core/domain/repositories/IAnalyticsRepository.ts` |
| Infra — repositorio | `src/core/infrastructure/repositories/supabase-analytics.repository.ts` |
| Aplicación — use case | `src/core/application/use-cases/analytics.use-case.ts` |
| API — food cost | `src/app/api/admin/analytics/food-cost/route.ts` |
| API — rentabilidad | `src/app/api/admin/analytics/rentabilidad/route.ts` |
| UI — food cost | `src/app/admin/(protected)/analytics/food-cost/page.tsx` |
| UI — rentabilidad | `src/app/admin/(protected)/analytics/rentabilidad/page.tsx` |
| Singleton | `getAnalyticsRepository()`, `getAnalyticsUseCase()` en `src/core/infrastructure/database/index.ts` |

## Respuestas API

`handleResult` devuelve el dato directamente (`NextResponse.json(data)`), sin envelope `{ data: ... }`.

- `GET /api/admin/analytics/food-cost` → `FoodCostAnalyticsResponse` (objeto)
- `GET /api/admin/analytics/rentabilidad` → `MargenProductoRow[]` (array directo)

El frontend de rentabilidad lee `const json = await res.json() as MargenProductoRow[]` — no `json.data`.

## Trampas críticas

- **CMP = 0 es válido para ingredientes sin compras**: el food cost teórico los trata como coste 0 sin error. El banner de aviso informa al usuario.
- **Productos sin receta NO se excluyen**: `analytics_margen_productos` usa `universo_productos` CTE con LEFT JOIN — botellas y latas sin escandallo aparecen con `coste_receta_cents = 0`.
- **`precioUnitarioCmpCents: null` en ajustes/mermas/inventario**: el trigger no actúa cuando es `NULL`. Solo las entradas de compra actualizan el CMP.
- **`precioCmpCents: 0` en `createIngrediente`**: los ingredientes nuevos arrancan con CMP 0 hasta su primera compra.
- **GIN index obligatorio**: sin `idx_pedidos_detalle_pedido_gin`, los RPCs hacen full table scan en `pedidos.detalle_pedido`. La migración lo crea automáticamente.
- **Visibilidad**: sidebar muestra "Analítica" solo para empresas con `requiresRestaurant: true`.
