# Plan: Pases por ítem + flujo pendientes

## Objetivo
Mover `pase` de nivel-pedido a nivel-ítem, unificar el flujo TPV → pendientes → cocina,
y añadir lanzamiento por grupo de pase en el panel del camarero.

## Diagrama de flujo final

```
Origen           Estado inicial        Acción camarero          Cocina
─────────────────────────────────────────────────────────────────────────
TPV (con pase) → pendiente_validacion → asigna/cambia pase, lanza grupo → kitchen
TPV (directo)  → pendiente           → (ninguna, va directo)              → kitchen
Waiter suplanta→ pendiente_validacion → asigna/cambia pase, lanza grupo → kitchen
Cliente carta  → pendiente_validacion → asigna/cambia pase, lanza grupo → kitchen
```

## Tasks

### T1 — Migración DB ✅
Archivo: `supabase/migrations/20260716000001_pase_por_item.sql`
- `ALTER TABLE pedido_item_estados ADD COLUMN pase TEXT DEFAULT NULL CHECK (pase IN ('primer','segundo','postre','bebida'))`
- No cambia RLS (columna en tabla existente)

### T2 — Tipos ✅
Archivo: `src/core/domain/repositories/IPedidoRepository.ts`
- Añadir `pase: string | null` a `PendienteValidacionItem`
- `KitchenItemRecord.pase` ya existe — solo cambia la fuente (de pedidos a pedido_item_estados)
- Añadir `updateItemPase(pedidoId: string, itemIdx: number, pase: string | null): Promise<Result<void>>`

### T3 — Repositorio ✅
Archivo: `src/core/infrastructure/database/supabase-pedido.repository.ts`
- `createMesaOrder`: al hacer INSERT en `pedido_item_estados`, incluir `pase` (valor inicial = pase del pedido)
- `fetchAllComidaItems` / `findWaiterKitchenItems`: cambiar `.select(... pase ...)` de `pedidos.pase` a `pedido_item_estados.pase`
- `findPendientesValidacion`: incluir `pase` en select de `pedido_item_estados`
- Implementar `updateItemPase`

### T4 — API /api/tpv/pedidos POST ✅
Archivo: `src/app/api/tpv/pedidos/route.ts`
- Añadir `directoACocina: z.boolean().optional().default(false)` al bodySchema
- Si `directoACocina: true` → `initialEstado = 'pendiente'` (comportamiento actual)
- Si `directoACocina: false` → `initialEstado = 'pendiente_validacion'`
- Pasar `pase` al use case para que se propague a cada item

### T5 — Use Case createMesaOrder ✅
Archivo: `src/core/application/use-cases/pedido.use-case.ts`
- Aceptar `pase?: string` en `CreateMesaPedidoDTO`
- Pasar `pase` al repo junto con `initialEstado`
- El repo lo escribe en cada fila de `pedido_item_estados`

### T6 — TPV TicketPanel ✅
Archivo: `src/components/tpv/TicketPanel.tsx`
- Añadir botón "Envío directo" debajo de los pases (estilo toggle, excluyente con los pases)
- Estado: `directoACocina: boolean`
- Si está activo: ignora pase seleccionado, envía `directoACocina: true`
- Si hay pase seleccionado: envía `directoACocina: false, pase: 'primer'|...`
- Si no hay nada seleccionado: envía `directoACocina: false` (va a pendientes sin pase)
- Incluir `directoACocina` en body del fetch

### T7 — API: PATCH pase de ítem ✅
Archivo: `src/app/api/waiter/kitchen/items/[pedidoId]/[itemIdx]/status/route.ts`
- Extender el PATCH existente para aceptar `pase` opcional además de `estado`
- Si el body incluye `pase`, llamar `updateItemPase`

### T8 — Waiter Pendientes UI ✅
Archivo: `src/app/waiter/pendientes/page.tsx`
- Añadir `pase: string | null` a `PendienteItem`
- Mostrar tag de pase por ítem (color por pase: 1º=naranja, 2º=azul, postre=verde)
- Selector de pase por ítem (botones pequeños: 1er | 2º | Postre | -)
- Botones de lanzamiento agrupado:
  - "Lanzar 1er pase" → lanza todos los ítems con `pase = 'primer'`
  - "Lanzar 2º pase" → lanza todos los ítems con `pase = 'segundo'`
  - "Lanzar postre" → lanza todos los ítems con `pase = 'postre'`
  - "Lanzar todo" → lanza todos (comportamiento actual)
- El cambio de pase llama PATCH al endpoint T7 con `pase`
- "Lanzar pase X" llama al validate/release por cada ítem del pase

### T9 — Waiter Kitchen filtros ✅
Archivo: `src/app/waiter/kitchen/page.tsx`
- Añadir tabs de filtro: [Todos] [1er pase] [2º pase] [Postre] [Sin pase]
- Filtrar `nuevosItems` y `preparadosItems` según el tab activo
- `PASE_LABEL` ya existe, reutilizar

### T10 — Kitchen standalone label ❌ PENDIENTE
Archivo: `src/app/kitchen/page.tsx`
- Mostrar badge de pase en cada tarjeta de ítem si `pase !== null`
- Leer `pase` desde la respuesta de `/api/kitchen/items`
- El API ya usa `findWaiterKitchenItems` que tendrá pase tras T3

## Orden de implementación

```
T1 (migración) → T2 (tipos) → T3 (repo) → T4+T5 (API+usecase)
→ T6 (TPV) → T7 (PATCH pase) → T8 (pendientes) → T9+T10 (kitchens)
```

## Archivos clave a NO romper

- `from_validation` / `retenido` en pendientes — la lógica de retención coexiste con pase
- `validateNewPedido` / `releaseRetainedPedidoItems` — agregar pase SIN modificar la firma existente
- `isWaiterRequest()` — no tocar, sigue siendo para la carta pública
- Trigger `deducir_stock_on_servido` — no se ve afectado
