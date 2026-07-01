# Kitchen Screens — Comparación Completa

Hay **tres pantallas distintas** relacionadas con cocina/bar. Son confundibles pero tienen propósitos, audiencias y mecánicas completamente diferentes.

---

## Resumen rápido

| | `/kitchen` | `/waiter/kitchen` | `/waiter/bar` |
|---|---|---|---|
| **Audiencia** | Cocinero (tablet en cocina) | Camarero (PDA/móvil) | Camarero (PDA/móvil) |
| **Autenticación** | Ninguna — standalone | PIN (`waiter_token` cookie) | PIN (`waiter_token` cookie) |
| **Items mostrados** | Comida (`en_preparacion` + `preparado`) | Comida (todos los estados) | Bebidas (todas, sin servido) |
| **Header** | Sticky (se mueve con scroll) | Fixed + ResizeObserver dinámico | Fixed + ResizeObserver dinámico |
| **Navegación** | Independiente — sin "volver" | Botón volver a `/waiter` | Botón volver a `/waiter` |
| **API** | `/api/kitchen/items` | `/api/waiter/kitchen/items` | `/api/waiter/bar/orders` |
| **Repositorio** | `findWaiterKitchenItems` | `findWaiterKitchenItems` (mismo) | `findBarOrders` |

> **Nota importante:** `/kitchen` y `/waiter/kitchen` usan la **misma función de repositorio** (`findWaiterKitchenItems`) y devuelven los mismos datos. La diferencia está en la autenticación de la API route y en la UI.

---

## `/kitchen` — Pantalla Standalone de Cocina

**Propósito:** Pantalla que vive fija en una tablet montada en cocina. No requiere login.

**Ruta:** `src/app/kitchen/page.tsx`
**API:** `GET /api/kitchen/items`
**Repo:** `findWaiterKitchenItems` → filtra comida, excluye `pendiente_validacion`

### Estados y swipe

| Swipe | Transición | Color reveal |
|---|---|---|
| Derecha | `pendiente → en_preparacion` | Azul (`EN_PREP_COLOR`) |
| Derecha | `en_preparacion → preparado` | Verde (`COUNTDOWN_COLOR`) — countdown 5 s |
| Izquierda | `en_preparacion → pendiente` | Naranja (`PENDIENTE_COLOR`) |
| Izquierda en `pendiente` | Sin efecto (borde de pantalla) | Transparente |

### Particularidades

- Header **sticky** (no fixed) — se queda arriba al hacer scroll pero el contenido fluye normalmente. Sin `ResizeObserver`.
- Items se agrupan (merge) por `nombre|complementos|nota|estado`.
- Countdown de 5 s antes de marcar `preparado` (permite cancelar).
- **Sin retenidos** — esta pantalla no maneja items con `from_validation=false`. Los retenidos son invisibles aquí.
- Time legend y filtros en la misma fila del header; usa `flex-nowrap overflow-x-auto` para evitar wrapping y alturas impredecibles.

---

## `/waiter/kitchen` — Vista de Cocina del Camarero

**Propósito:** Pantalla de cocina dentro del panel de camarero. El camarero puede ver y retener items, liberar retenidos, filtrar por estado.

**Ruta:** `src/app/waiter/kitchen/page.tsx`
**API:** `GET /api/waiter/kitchen/items`
**Repo:** `findWaiterKitchenItems` (idéntico al de `/kitchen`)

### Estados y swipe

| Swipe | Efecto | Color reveal |
|---|---|---|
| Derecha en `nuevo` | `pendiente → en_preparacion` | Azul |
| Derecha en `en_preparacion` | `en_preparacion → listo` | Verde |
| Izquierda en `nuevo` | Retener (→ `retenido`, `from_validation=false`) | Ámbar |
| Izquierda en `en_preparacion` | Abre dialog de confirmación antes de retener | Ámbar + dialog |
| Izquierda en `retenido` | Restore (→ `pendiente`) | — |

> Diferencia clave vs `/kitchen`: **swipe izquierdo retiene** en lugar de deshacer. Son semánticas opuestas.

### Modos de filtro (GroupBy)

| Modo | Descripción |
|---|---|
| `Por pedido` | Lista plana, un grupo por pedido. Sin colapso. |
| `Por mesa` | Agrupado por mesa. Cada mesa es colapsable. |
| `Listos` | Solo items `preparado`, agrupados por mesa. |
| `Retenidos` | Solo items retenidos (`from_validation=false`), agrupados por mesa. |

**URL deep-link:** `/waiter/kitchen?groupBy=retenidos&mesa=<mesaName>` — abre directo en la pestaña Retenidos y auto-scroll a esa mesa.

### Particularidades

- Header **fixed** con `ResizeObserver` → `headerHeight` state → `paddingTop` dinámico en el contenido. Evita que los primeros items queden tapados cuando el header tiene altura variable.
- Botón per-mesa (Utensils, azul) para liberar todos los retenidos de esa mesa de vuelta a `pendiente`.
- Colapso global (ChevronsUpDown) visible solo en modos con grupos.
- Items en `pendiente_validacion` son invisibles hasta que el camarero los valida en `/waiter/pendientes`.

---

## `/waiter/bar` — Vista de Bar del Camarero

**Propósito:** Equivalente a `/waiter/kitchen` pero exclusivamente para bebidas. Sin estados intermedios — el swipe va directo a servido con countdown.

**Ruta:** `src/app/waiter/bar/page.tsx`
**API:** `GET /api/waiter/bar/orders`
**Repo:** `findBarOrders` (diferente — maneja `BarOrder` con estructura de pedido completo)

### Estados y swipe

| Swipe | Efecto |
|---|---|
| Izquierda | Inicia countdown de 5 s → marca item como `servido` |
| Derecha | Inicia countdown de cancelación (borrar item de la lista) |

> En bar **no hay estados intermedios** (`en_preparacion`, `preparado`). Es binario: pendiente o servido.

### Modos de filtro

| Modo | Descripción |
|---|---|
| `Por pedido` | Lista plana, un grupo por pedido. |
| `Por mesa` | Agrupado por mesa. Footer con botón "Todos servidos" → countdown masivo. |

### Particularidades

- Header **fixed** con `ResizeObserver` → misma mecánica que `/waiter/kitchen`.
- Items agrupados (merge) en modo `Por mesa` por `nombre|nota` (no por estado — en bar todos los pendientes son iguales).
- **"Todos servidos" por mesa:** botón en el footer de cada grupo en modo `Por mesa`. Abre modal de confirmación; al confirmar lanza un countdown de 5 s para cada item de la mesa simultáneamente.
- Cancelación de item (swipe derecho) requiere confirmación en dialog antes de ejecutar.
- Items servidos se persisten en `localStorage` (`bar_served_keys`) como caché optimista — si el server ya los filtró, no reaparecen entre polls.
- Si el pedido es de tipo mixto (comida + bebida), después de servir todas las bebidas el estado del pedido pasa a `anotado` en lugar de `servido`, para que la cocina siga viendo los items de comida.

---

## Trampas comunes

### "¿Por qué `/kitchen` no muestra items que sí aparecen en `/waiter/kitchen`?"

Ambas usan `findWaiterKitchenItems`. Si un item aparece en una y no en otra, es un problema de caché de browser o de estado de la suscripción Realtime — no un bug de datos.

### "¿Por qué un item retenido desaparece de `/kitchen` pero sigue en `/waiter/kitchen`?"

`/kitchen` muestra solo `en_preparacion` y `preparado`. Los retenidos (`retenido`) son invisibles en la pantalla de cocina standalone. `/waiter/kitchen` los muestra en el filtro "Retenidos".

### "¿Por qué los primeros items se cortan con el header?"

Tanto `/waiter/kitchen` como `/waiter/bar` usan header **fixed** + ResizeObserver. Si el header cambia de altura (time legend wrapping, cambio de orientation), el `paddingTop` del contenido se recalcula automáticamente. La versión anterior usaba `pt-[120px]` hardcodeado.

### "¿Cuál es la fuente de verdad del estado de un item?"

`pedido_item_estados` — siempre. No leer `pedidos.estado` para saber si un ítem está listo. `findWaiterKitchenItems` y `findBarOrders` leen la tabla de estados por ítem, no el estado del pedido padre.

---

## Notas de ítem (campo `nota`)

Los clientes y camareros pueden añadir una nota libre a cada ítem del carrito (ej. "sin cebolla", "punto medio"). Esta nota fluye por todo el pipeline:

```
QuantitySelectorDialog (Textarea, max 500 chars)
  → CartItem.note
  → POST /api/pedidos (Zod: note: z.string().max(500).optional())
  → PedidoUseCase → detalle_pedido.nota (columna JSONB)
  → findWaiterKitchenItems / findBarOrders → KitchenItemRecord.nota / BarOrderItem.items[].nota
  → /kitchen, /waiter/kitchen, /waiter/bar, /waiter/pendientes
```

### Visualización

Las notas se muestran como un **pill ámbar** debajo del nombre del ítem:

```tsx
<span className="text-xs font-medium italic block mt-0.5 px-1.5 py-0.5 rounded"
  style={{ color: 'oklch(88% 0.18 85)', background: 'oklch(28% 0.12 85 / 0.45)' }}>
  ✎ {nota}
</span>
```

### Merge key incluye nota

Items con el mismo nombre pero diferente nota se tratan como items distintos en el merge. La merge key es `nombre|complementos|nota|estado`.

### En `/waiter/pendientes`

Las notas se muestran con el estilo `text-[10px] italic` (más compacto, sin pill de fondo) para respetar la densidad de información de la pantalla de validación.
