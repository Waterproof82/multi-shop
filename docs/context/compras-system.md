# Sistema de Compras y Proveedores (SIALTI) — Contexto

> Bloque 1 implementado en `feature/bloque1-compras-pr1`, mergeado en `develop` el 2026-07-15.

## Tablas (migración `20260715000001_modulo_compras_sialti.sql`)

| Tabla | Descripción |
|-------|-------------|
| `proveedores` | Maestro de proveedores por tenant. `UNIQUE(empresa_id, cif)`. |
| `catalogo_compra` | Artículos compra-proveedor con precio, unidad, factor conversión e IVA. `UNIQUE(proveedor_id, ingrediente_id)`. |
| `pedidos_compra` | Cabecera del pedido. Estados: `borrador → enviado → recibido / cancelado`. |
| `pedidos_compra_items` | Líneas de pedido. Precio e IVA copiados del catálogo al crear — inmutables una vez `estado = 'enviado'`. |
| `albaranes_compra` | Albarán de recepción. Estados: `borrador → recibido`. |
| `albaranes_compra_items` | Líneas de albarán con `numero_lote`, `fecha_caducidad` y `movimiento_stock_id`. |
| `facturas_proveedor` | Factura con desglose de base imponible al 0/4/10/21% + `iva_soportado_cents` + `total_factura_cents`. `UNIQUE(empresa_id, proveedor_id, numero_factura)`. |
| `facturas_proveedor_albaranes` | Join M:N — una factura puede cubrir varios albaranes. |

## Extensiones a tablas existentes

- `ingredientes.es_perecedero BOOLEAN DEFAULT FALSE` — activa la trazabilidad sanitaria.
- `tpv_turno_eventos` — CHECK constraint ampliado para incluir `'compra_proveedor'`.

## Compliance Regulatorio

| Regulación | Qué exige | Dónde se aplica |
|------------|-----------|-----------------|
| Reg. CE 178/2002 | `numero_lote` + `fecha_caducidad >= hoy` OBLIGATORIOS para ingredientes perecederos en recepción | `addItemToAlbaranUseCase`, `marcarAlbaranRecibidoUseCase` |
| Ley Antifraude 11/2021 | Albaranes en `estado = 'recibido'` son INMUTABLES | Trigger `block_albaran_alteration` + `block_albaran_deletion` + guard en use case |
| RD 1619/2012 | Facturas DEBEN tener desglose de IVA por tipo. Tolerancia ±2 céntimos | `createFacturaProveedorUseCase` |

## Códigos de error COMPRAS_*

| Código | HTTP | Cuándo |
|--------|------|--------|
| `COMPRAS_PROVEEDOR_NOT_FOUND` | 404 | Proveedor no existe o no pertenece al tenant |
| `COMPRAS_PROVEEDOR_HAS_TRANSACTIONS` | 409 | Eliminar proveedor con pedidos/albaranes activos |
| `COMPRAS_PEDIDO_NOT_FOUND` | 404 | — |
| `COMPRAS_PEDIDO_ESTADO_INVALIDO` | 422 | Mutación inválida según estado |
| `COMPRAS_ALBARAN_NOT_FOUND` | 404 | — |
| `COMPRAS_ALBARAN_YA_RECIBIDO` | 409 | Marcar como recibido un albarán ya recibido |
| `COMPRAS_ALBARAN_RPC_ERROR` | 422 | RPC `recibir_albaran_transaccional` devuelve `success: false` |
| `COMPRAS_FACTURA_NOT_FOUND` | 404 | — |
| `COMPRAS_FACTURA_YA_PAGADA` | 409 | Registrar pago en factura ya pagada |
| `COMPRAS_FACTURA_DUPLICADA` | 409 | `numero_factura` ya existe para ese proveedor/tenant |
| `COMPRAS_FACTURA_IVA_INVALIDO` | 422 | Desviación de IVA > 2 céntimos |
| `COMPRAS_FACTURA_TOTAL_INVALIDO` | 422 | Total != suma de bases + IVA |
| `COMPRAS_TURNO_NO_ACTIVO` | 422 | Pago caja sin turno abierto o turno no pertenece al tenant |
| `SANIDAD_TRAZABILIDAD_REQUERIDA` | 422 | Ingrediente perecedero sin lote o caducidad (CE 178/2002) |

## RPC: `recibir_albaran_transaccional`

```sql
SECURITY DEFINER
Parámetros: p_albaran_id UUID, p_empresa_id UUID, p_empleado_id UUID
Retorna: JSONB { success: boolean, error?: string }
```

Dentro de una sola transacción:
1. Bloquea la fila con `FOR UPDATE` (evita doble recepción)
2. Verifica que hay ítems
3. Por cada ítem: INSERT `movimientos_stock` + UPDATE `movimiento_stock_id` + UPDATE `ingredientes.cantidad_actual`
4. UPDATE `albaranes_compra.estado = 'recibido'`

El repositorio verifica `data.success` y si es `true` re-fetcha el albarán completo vía `findAlbaranById` (el RPC solo retorna `{ success: true }`, no el row completo).

## Flujo de pago por caja (`registrarPagoFactura`)

1. Use case verifica: `tpv_turnos WHERE id=turnoId AND empresa_id=empresaId AND estado='abierto'`
2. Repositorio inserta `tpv_turno_eventos` con `tipo='compra_proveedor'` y `monto_cents` positivo
3. Luego UPDATE `facturas_proveedor.estado_pago = 'pagado_caja'`

El orden INSERT-antes-UPDATE garantiza que si falla la escritura del evento, la factura queda en `pendiente`.

## IVA 0%

El catálogo y las facturas soportan `porcentaje_iva = 0` (exenciones, operaciones intracomunitarias, régimen especial agrícola). CHECK: `IN (0, 4, 10, 21)`.

## IGIC (Canarias)

Las empresas en las Islas Canarias tributan por IGIC en lugar de IVA. Migración `20260715000002_compras_igic.sql` extiende el soporte:

- `catalogo_compra.porcentaje_iva` — CHECK ampliado a `IN (0, 3, 4, 7, 9.5, 10, 15, 21)` para admitir tipos IGIC
- `facturas_proveedor` — columnas `base_imponible_3_cents`, `base_imponible_9_5_cents`, `base_imponible_15_cents` añadidas
- El label del impuesto en UI se deriva de `empresa.tipo_impuesto` (`'iva'|'igic'`); no está hardcodeado

Tipos IGIC en restauración:
| Tipo | Aplica a |
|------|----------|
| 0% | Exenciones, operaciones intracomunitarias |
| 3% | Productos de primera necesidad (pan, leche, frutas, verduras) |
| 7% | Tipo general (alimentos procesados, bebidas no alcohólicas) |
| 9.5% | Bebidas alcohólicas, refrescos |
| 15% | Labores del tabaco, ciertos lujos |

## Rutas API (18 endpoints)

Todas bajo `/api/admin/compras/`. Todas usan `resolveAdminContextWithEmpresa`.

| Recurso | Métodos |
|---------|---------|
| `/proveedores` | GET, POST |
| `/proveedores/[id]` | PUT, DELETE |
| `/proveedores/[id]/catalogo` | GET, POST |
| `/proveedores/[id]/catalogo/[itemId]` | PUT, DELETE |
| `/pedidos` | GET, POST |
| `/pedidos/[id]` | GET |
| `/pedidos/[id]/items` | POST |
| `/pedidos/[id]/items/[itemId]` | PUT, DELETE |
| `/pedidos/[id]/enviar` | POST |
| `/pedidos/[id]/cancelar` | POST |
| `/albaranes` | GET, POST |
| `/albaranes/[id]` | GET |
| `/albaranes/[id]/items` | POST |
| `/albaranes/[id]/items/[itemId]` | PUT, DELETE |
| `/albaranes/[id]/recibir` | POST |
| `/facturas` | GET, POST |
| `/facturas/[id]` | GET |
| `/facturas/[id]/pagar` | POST |

## Paginas Admin

Bajo `/admin/compras/` con sub-nav de 4 tabs. Sin `requiresRestaurant` (aplica a tiendas y restaurantes).

- `proveedores/` — CRUD con activar/desactivar y gestion de catalogo
- `pedidos/` + `pedidos/[id]/` — Lista y detalle con transiciones de estado
- `albaranes/` + `albaranes/[id]/` — Banner de inmutabilidad cuando `estado='recibido'`; lote+caducidad visibles solo si `esPerecedero=true`
- `facturas/` + `facturas/[id]/` — Auto-calculo de IVA; registrar pago

## Trampas criticas

- **RPC devuelve `{ success: true }`, no el albaran** — el repositorio debe re-fetchear via `findAlbaranById` tras un RPC exitoso.
- **`monto_cents` siempre POSITIVO** en `tpv_turno_eventos` — la salida de caja se infiere del `tipo_evento = 'compra_proveedor'`, no del signo.
- **`AlbaranEstado` no tiene `'cancelado'`** — solo `'borrador'` y `'recibido'`. No filtrar por cancelado en consultas de albaranes.
- **`removePedidoItem` usa use case, no repo directamente** — el route DELETE llama `removePedidoItemUseCase` que guarda el check de `estado = 'borrador'`.

## Archivos clave

- `supabase/migrations/20260715000001_modulo_compras_sialti.sql`
- `src/core/domain/entities/compras-types.ts`
- `src/core/domain/repositories/IComprasRepository.ts`
- `src/core/infrastructure/database/supabase-compras.repository.ts`
- `src/core/application/use-cases/compras/` (18 use cases)
- `src/app/api/admin/compras/` (18 rutas)
- `src/app/admin/(protected)/compras/` (8 paginas + layout)
- `src/app/admin/(protected)/compras/compras-utils.ts` — helpers de badge compartidos
