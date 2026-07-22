# Realtime Channels — Waiter System

## Arquitectura de canales activa

| Canal | Tipo | Tabla/evento | Quien escucha |
|---|---|---|---|
| `waiter-banner-{uid}` | postgres_changes | pedidos, pedido_item_estados, mesa_sesiones | WaiterBanner |
| `waiter-new-order` | broadcast `new-order` | trigger notify_waiter_new_order (todos los INSERTs) | WaiterBanner, MostradorClient |
| `waiter-new-order-kitchen` | broadcast `new-order` | trigger notify_waiter_new_order | WaiterKitchenPage |
| `waiter-new-order-bar` | broadcast `new-order` | trigger notify_waiter_new_order | BarPage |
| `waiter-items-update` | broadcast `item-update` | trigger notify_waiter_items_update + trigger pedidos_notify_item_update | WaiterBanner, BarPage, WaiterLoginForm, MostradorClient, TpvCatalogProvider |
| `tpv-pedidos-{sesionId}` | postgres_changes | pedidos (UPDATE, filter sesion_id) | MostradorClient |
| `tpv-sesion-close-{sesionId}` | postgres_changes | mesa_sesiones (UPDATE, filter id) | MostradorClient |
| `waiter-kitchen-{uid}` | postgres_changes | pedido_item_estados, pedidos | WaiterKitchenPage |
| `waiter-bar-{uid}` | postgres_changes | pedido_item_estados, pedidos | BarPage |
| `waiter-pendientes-{uid}` | postgres_changes | pedidos, pedido_item_estados, mesa_sesiones | WaiterPendientesPage |
| `waiter-login-mesas-{uid}` | postgres_changes | mesa_sesiones | WaiterLoginForm |
| `kitchen-standalone` | postgres_changes | pedido_item_estados, pedidos | /kitchen page |

## DOM relay: `waiter-realtime-update`

`WaiterBanner` dispara `globalThis.dispatchEvent(new CustomEvent('waiter-realtime-update'))` cuando recibe cualquier update de Realtime. Los componentes waiter lo escuchan como fallback. **Nunca** hacer fetch en el handler si `confirmingRef.current.size > 0`.

## Trampas conocidas

### 1. React StrictMode double-mount con canal de nombre fijo

El cleanup del primer mount cierra el canal; el segundo mount recibe un canal ya cerrado y nunca escucha.

**Fix para `postgres_changes`:** sufijo de instancia con `useId()`, NO con `Math.random()` (ESLint `react-hooks/purity` lo prohibe):

```ts
const instanceId = useId().replace(/:/g, '-')
const channelRef = useRef(`waiter-banner-${instanceId}`)
```

**Fix para broadcast channels (nombre fijo obligatorio):** guard de estado async — `if (!waiterEmpresaId) return` — de modo que el efecto hace early return en el segundo mount de StrictMode (cuando el fetch todavia no termino) y las suscripciones se crean una sola vez. Afecta a `/kitchen` standalone: `src/app/kitchen/page.tsx`.

### 2. `postgres_changes` silenciado en cliente singleton

Supabase JS comparte una unica conexion WebSocket. Varios componentes suscribiendo a la misma tabla desde distintos canales pueden dejar de recibir eventos.

**Fix hibrido:** el componente central (`WaiterBanner`) escucha `postgres_changes` y ademas dispara un `CustomEvent('waiter-realtime-update')` por DOM, que los demas componentes capturan como fallback.

### 3. Race condition en validate loop

Cuando pendientes valida multiples pedidos secuencialmente, el trigger de DB lanza un broadcast despues de cada PATCH. El relay DOM llama `fetchPendientes()` entre iteraciones y devuelve estado parcial.

**Fix:** `confirmingRef` (mirror de `useRef` del estado `confirming`); el relay retorna temprano si `confirmingRef.current.size > 0`. El `finally` del loop hace el fetch autoritativo.

### 4. Mesa grid badge no se actualiza al marcar items en cocina

La cocina modifica `pedido_item_estados`, que no toca `mesa_sesiones`. `WaiterLoginForm` solo escuchaba `mesa_sesiones`.

**Fix:** agregar suscripcion al broadcast `waiter-items-update` (canal `'waiter-items-update'`, evento `'item-update'`).

### 5. `removeSessionItemUseCase` bypasea `pedido_item_estados`

Cuando el camarero elimina items desde el ticket del waiter, `removeSessionItemUseCase` hace DELETE o UPDATE directamente en `pedidos.detalle_pedido`, sin tocar `pedido_item_estados`. El trigger `notify_waiter_items_update` solo escucha esa tabla → nunca disparaba → grid de mesas del TPV quedaba stale.

**Fix:** trigger `pedidos_notify_item_update` (migracion `20260721000002`) en la tabla `pedidos`, evento DELETE o UPDATE OF `detalle_pedido`/`total`, emite el mismo broadcast `waiter-items-update`. `TpvCatalogProvider` tambien suscribe a ese canal para refrescar totales del grid.

### 6. Race condition broadcast vs. auto-cancel en MostradorClient

`realtime.send()` dentro de un trigger de DB es asincronico: el broadcast `item-update` puede llegar al cliente antes de que la transaccion que cancela el pedido commitee. El refresh inmediato devuelve el pedido todavia activo.

**Fix:** `postgres_changes` en `pedidos` filtrado por `sesion_id` (canal `tpv-pedidos-{sesionId}`) en `MostradorClient`. Ese evento es transaccional y solo llega despues del commit completo.
