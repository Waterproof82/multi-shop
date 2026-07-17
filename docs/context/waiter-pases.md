# Waiter — Sistema de Pases por Ítem

## Propósito

Permite al camarero asignar un "pase" (marcha) a cada ítem individual de un pedido desde la vista `/waiter/pendientes`, controlando el orden en que cada plato llega a cocina. A diferencia del pase a nivel de pedido (TPV), aquí el camarero puede lanzar solo los platos del primer pase mientras retiene el segundo para más adelante.

---

## Valores permitidos

| Valor | Etiqueta UI |
|-------|-------------|
| `primer` | 1er pase |
| `segundo` | 2º pase |
| `postre` | Postre |
| `NULL` | Sin pase asignado |

---

## Base de datos

### Columna `pase` en `pedidos` (nivel pedido)
```sql
-- Migration: 20260706000006_pedidos_pase.sql
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pase TEXT
  CHECK (pase IN ('primer', 'segundo', 'postre', 'bebida'));
```
Usada cuando el pedido entero corresponde a un pase (carta pública agrupando por pase, TPV).

### Columna `pase` en `pedido_item_estados` (nivel ítem)
```sql
-- Migration: 20260716000001_pase_por_item.sql
ALTER TABLE public.pedido_item_estados ADD COLUMN IF NOT EXISTS pase TEXT DEFAULT NULL
  CHECK (pase IN ('primer', 'segundo', 'postre', 'bebida'));
```
Fuente de verdad para pase por ítem en el flujo waiter. Tiene prioridad sobre `pedidos.pase`.

---

## Flujo completo

### 1. Waiter añade ítem a la carta (suplantando mesa)

En `QuantitySelectorDialog`:
- El selector de pase es **obligatorio** para ítems de comida en modo waiter
- No hay opción de "añadir como retenido" — todo va siempre a `pendiente_validacion`
- La selección de pase se almacena en `CartItem.pase`
- El botón "Añadir al carrito" está bloqueado hasta que se seleccione un pase

En `cart-drawer`:
- Los ítems se agrupan por pase → cada grupo genera un pedido separado (`POST /api/pedidos` con `pase` en el body)
- Todos los pedidos del waiter van a `pendiente_validacion` — no existe la ruta `initialEstado: 'retenido'` desde el carrito

### 2. Pase propagado desde JSONB

`findPendientesValidacion` lee el pase en tres pasos:
1. Fetch de `pedidos.detalle_pedido[idx].pase` (JSONB) — fuente primaria al crear el pedido
2. Fetch de `pedido_item_estados.pase` — override aplicado si existe
3. Fallback a `pedidos.pase` (nivel pedido) si ninguno de los anteriores tiene valor

Mapper en `supabase-pedido.repository.ts → mapPendienteItem`:
```typescript
const itemPase = item['pase'] as string | null | undefined;
const resolvedPase = itemPase ?? pedidoPase ?? null;
```

### 3. Camarero gestiona pases en `/waiter/pendientes`

- Cada ítem muestra un selector de 3 botones (1er pase / 2º pase / Postre) con colores distintivos
- El camarero puede cambiar el pase de un ítem → `PATCH /api/waiter/kitchen/items/{pedidoId}/{itemIdx}/status { pase: ... }`
- El cambio es optimista: `paseOverrides[globalKey]` se actualiza en React state inmediatamente
- `updateItemPase` escribe en dos lugares:
  1. `pedidos.detalle_pedido[idx].pase` (JSONB) — persistencia primaria
  2. `pedido_item_estados.pase` (UPDATE best-effort) — para step 3 del read path

### 4. Lanzar un pase a cocina

Botones en el header de cada mesa (misma altura que los demás botones de acción):
- Solo aparecen para los pases que tienen ítems asignados en esa mesa
- Al pulsar → popup de confirmación mostrando cuántos ítems se van a lanzar
- Al confirmar → `handleLanzarPase(mesaId, pase)`

`handleLanzarPase`:
- Filtra los ítems que tienen ese pase (respetando `paseOverrides`)
- Respeta el `pausedMap` real de la mesa — ítems con ⏸ activo van a cocina como `retenido`
- Llama `validateNewPedido` o `releaseRetainedPedidoItems` según si el pedido ya fue validado o no
- Los ítems de otros pases quedan en pendientes

---

## Componentes afectados

### `QuantitySelectorDialog`
- Pase obligatorio para comida en modo waiter (`disabled` hasta seleccionar)
- Etiqueta "Pase *" con asterisco
- Botones siempre coloreados (intensidad reducida cuando no están seleccionados)
- Eliminado: checkbox "Añadir como retenido"

### `cart-drawer.tsx`
- Eliminado: split `toOrder` / `toDefer`
- Eliminado: envío con `initialEstado: 'retenido'`
- Eliminado: botón ⏸ por ítem en el carrito
- Eliminado: dialog "Hay ítems retenidos"
- Todos los ítems van como `toOrder` agrupados por pase

### `/api/pedidos/route.ts`
- Waiter → siempre `pendiente_validacion`, salvo `initialEstado: 'retenido'` explícito (solo vía API interna)
- Antes: solo iba a `pendiente_validacion` si tenía pase asignado; sin pase iba directo a cocina

### `supabase-pedido.repository.ts → updateItemPase`
- Escribe `pase` en `pedidos.detalle_pedido[idx]` (JSONB) — igual que antes
- Añadido: UPDATE best-effort a `pedido_item_estados.pase` para sincronizar el read path del step 3

### `waiter/pendientes/page.tsx`
- Botones "Lanzar pase" movidos al header de mesa (mismo tamaño que botones de acción)
- Dialog de confirmación antes de lanzar
- `handleLanzarPase` usa `pausedMap[mesaId]` (antes usaba `new Set()` vacío → bug)
- Etiquetas de pase por ítem en tamaño `text-[11px]`
- Eliminada: fila 2 separada de botones "Lanzar"

### `waiter/kitchen/page.tsx`
- Items en estado `pendiente` muestran "En cocina" (antes: "Nuevo")
- Clave de traducción: `kitchenEnCocina` (5 idiomas)

---

## API

### `PATCH /api/waiter/kitchen/items/{pedidoId}/{itemIdx}/status`

```typescript
// Body
{ pase?: 'primer' | 'segundo' | 'postre' | null }

// Llama a:
getPedidoRepository().updateItemPase(empresaId, pedidoId, itemIdx, pase)
```

---

## Trampas conocidas

- **`handleLanzarPase` y pausedMap**: La función recibe `mesaId` y `pase` pero necesita acceder al `pausedMap` del estado de React — añadida al array de dependencias del `useCallback`. Antes usaba un `emptyPaused = new Set()` que ignoraba todos los ítems pausados.
- **`updateItemPase` es UPDATE-only en `pedido_item_estados`**: No hace upsert — solo actualiza si ya existe una fila (para no interferir con el campo `estado`). Si no existe fila (ítem aún no ha pasado por cocina), el pase solo vive en el JSONB.
- **Pase de bebidas**: Las bebidas no tienen selector de pase (sin sentido operativo). Solo comida muestra el selector en `QuantitySelectorDialog` y en pendientes.
- **Colores de pase**: Definidos con `oklch` en 3 puntos del código (`pendientes/page.tsx`, `quantity-selector-dialog.tsx`, `cart-drawer.tsx`). No están centralizados — cambiar los colores requiere actualizar los tres archivos.
