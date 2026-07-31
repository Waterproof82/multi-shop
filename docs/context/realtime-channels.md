# Realtime Channels — Waiter System

## Anon y RLS — regla de oro (desde 2026-07-31)

`anon` **no tiene SELECT** sobre `pedidos`, `mesa_sesiones` ni `pedido_item_estados` — la deny-all de esas 3 tablas (y de las 44 restantes con datos no públicos) es `RESTRICTIVE`, así que `postgres_changes` **nunca** entrega eventos a un cliente `anon` para esas tablas, sin importar el `filter`. Ver [`security.md`](./security.md#incidente-2026-07-31--fuga-cross-tenant-vía-rls-permissive--realtime) para el porqué.

**Toda señal de Realtime hacia un cliente `anon` en estas 3 tablas se hace exclusivamente vía Broadcast** (`realtime.send()` desde un trigger dedicado), nunca vía `postgres_changes`. Si necesitás que un componente reaccione a un cambio en `pedidos`/`mesa_sesiones`/`pedido_item_estados` y corre con `getSupabaseAnonClient()` o un cliente anon dedicado, el trigger de broadcast tiene que existir ya o crearse — no se puede resolver agregando una policy RLS permisiva a la tabla (eso es exactamente el bug de origen).

Las suscripciones `postgres_changes` a estas 3 tablas que quedan en el código (WaiterBanner, `/kitchen`, `/waiter/kitchen`, `/waiter/bar`, `/waiter/pendientes`) son no-ops inofensivos para `anon` — nunca reciben nada, pero las señales que necesitan ya les llegan por Broadcast en paralelo (`waiter-new-order`, `waiter-items-update`). No es necesario eliminarlas activamente, pero tampoco agregar nuevas.

## Arquitectura de canales activa

| Canal | Tipo | Tabla/evento | Quien escucha |
|---|---|---|---|
| `waiter-banner-{uid}` | postgres_changes (no-op para anon, ver arriba) | pedidos, pedido_item_estados | WaiterBanner |
| `waiter-new-order` | broadcast `new-order` | trigger notify_waiter_new_order (todos los INSERTs) | WaiterBanner, MostradorClient |
| `waiter-new-order-kitchen` | broadcast `new-order` | trigger notify_waiter_new_order | WaiterKitchenPage |
| `waiter-new-order-bar` | broadcast `new-order` | trigger notify_waiter_new_order | BarPage |
| `waiter-items-update` | broadcast `item-update` | trigger notify_waiter_items_update + trigger pedidos_notify_item_update | WaiterBanner, BarPage, MostradorClient, TpvCatalogProvider |
| `mesa-sesion-update` | broadcast `update` | trigger notify_mesa_sesion_update (INSERT/UPDATE en mesa_sesiones) | WaiterBanner, ClientMenuPage, TpvCatalogProvider, MesaOrdersClient, MostradorClient |
| `pedido-estado-update` | broadcast `update` | trigger notify_pedido_estado_update (UPDATE OF estado en pedidos) | MostradorClient |
| `waiter-kitchen-{uid}` | postgres_changes (no-op para anon) | pedido_item_estados, pedidos | WaiterKitchenPage |
| `waiter-bar-{uid}` | postgres_changes (no-op para anon) | pedido_item_estados, pedidos | BarPage |
| `waiter-pendientes-{uid}` | postgres_changes (no-op para anon) | pedidos, pedido_item_estados | WaiterPendientesPage |
| `kitchen-standalone` | postgres_changes (no-op para anon) | pedido_item_estados, pedidos | /kitchen page |

> `waiter-login-mesas-{uid}` (postgres_changes en mesa_sesiones) se eliminó — `WaiterLoginForm` escucha el DOM relay `waiter-realtime-update` que dispara `WaiterBanner` en su lugar (evita competir por `mesa-sesion-update` en el cliente singleton, ver trampa #4).

## DOM relay: `waiter-realtime-update`

`WaiterBanner` dispara `globalThis.dispatchEvent(new CustomEvent('waiter-realtime-update'))` cuando recibe cualquier update de Realtime. Los componentes que no son dueños de un canal propio deben escuchar este evento DOM en lugar de suscribirse directamente a `waiter-items-update`. **Nunca** hacer fetch en el handler si `confirmingRef.current.size > 0`.

**Regla crítica — singleton conflict:** El cliente Supabase es un singleton. Si dos componentes llaman `.channel('waiter-items-update')` sobre el mismo cliente, compiten por el mismo canal y uno de ellos puede dejar de recibir eventos silenciosamente. `WaiterBanner` es el ÚNICO dueño de `waiter-items-update`. Todos los demás componentes que necesiten reaccionar a cambios de ítems deben escuchar `waiter-realtime-update` vía DOM.

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

La cocina modifica `pedido_item_estados`, que no toca `mesa_sesiones`. `WaiterLoginForm` solo escuchaba `mesa_sesiones` → el badge "Platos listos" no aparecía hasta recargar la página.

**Primer intento (bug):** agregar suscripción directa a `channel('waiter-items-update')` en `WaiterLoginForm`. Funcionaba en aislamiento pero en producción `WaiterBanner` ya suscribía el mismo canal en el mismo cliente singleton — uno de los dos dejaba de recibir eventos silenciosamente.

**Fix correcto (commit 72632be):** eliminar la suscripción directa y escuchar el DOM relay en su lugar:
```ts
globalThis.addEventListener('waiter-realtime-update', debouncedRefresh);
// cleanup:
globalThis.removeEventListener('waiter-realtime-update', debouncedRefresh);
```
`WaiterBanner` ya recibe `item-update` y re-dispara `CustomEvent('waiter-realtime-update')` — `WaiterLoginForm` reacciona sin competir por el canal WebSocket.

### 5. `removeSessionItemUseCase` bypasea `pedido_item_estados`

Cuando el camarero elimina items desde el ticket del waiter, `removeSessionItemUseCase` hace DELETE o UPDATE directamente en `pedidos.detalle_pedido`, sin tocar `pedido_item_estados`. El trigger `notify_waiter_items_update` solo escucha esa tabla → nunca disparaba → grid de mesas del TPV quedaba stale.

**Fix:** trigger `pedidos_notify_item_update` (migracion `20260721000002`) en la tabla `pedidos`, evento DELETE o UPDATE OF `detalle_pedido`/`total`, emite el mismo broadcast `waiter-items-update`. `TpvCatalogProvider` tambien suscribe a ese canal para refrescar totales del grid.

### 6. Race condition broadcast vs. auto-cancel en MostradorClient

Cuando se cancela el último ítem de un pedido, dos triggers separados se disparan sobre el mismo evento de `pedido_item_estados`: `notify_waiter_items_update` (dispara `item-update` de inmediato) y `fn_auto_cancel_pedido_when_all_items_cancelled` (recién después actualiza `pedidos.estado = 'cancelado'`, dentro de la misma transacción). Si `MostradorClient` hace `refresh()` apenas recibe `item-update`, puede llegar a leer `pedidos` **antes** de que el `UPDATE estado` del segundo trigger haya corrido — el pedido sigue viéndose activo.

**Fix histórico (hasta 2026-07-31):** `postgres_changes` en `pedidos` filtrado por `sesion_id` (canal `tpv-pedidos-{sesionId}`) — CDC basado en WAL, solo entrega después del commit completo, así que llegaba después de que `fn_auto_cancel_pedido_when_all_items_cancelled` ya hubiera corrido.

**Fix actual:** ese `postgres_changes` dejó de funcionar para `anon` cuando `pedidos` pasó a RESTRICTIVE deny-all (ver arriba). Se reemplazó por un trigger de broadcast dedicado — `notify_pedido_estado_update()`, `AFTER UPDATE OF estado ON pedidos` — que solo se dispara una vez que `pedidos.estado` ya cambió *dentro de la misma transacción* (es decir, después de que `fn_auto_cancel_pedido_when_all_items_cancelled` corrió), preservando la misma garantía de ordenamiento sin depender de RLS. Canal `pedido-estado-update`, filtrado por `sesionId` en el cliente. Mismo patrón aplicado a `tpv-sesion-close-{sesionId}` (ahora parte del payload de `mesa-sesion-update`, con `sesionId` y `cerradaAt` agregados).

### 7. Canal de Broadcast = clave de ruteo, no identificador libre

Para `postgres_changes`, el nombre pasado a `.channel(nombre)` es arbitrario — el ruteo real lo hace el `filter` sobre la tabla. Para Broadcast, el nombre del canal **es** la clave de ruteo: tiene que coincidir exactamente con el tercer argumento de `realtime.send(payload, event, topic, private)` en el trigger, o el cliente nunca recibe nada (sin error, sin warning — el canal simplemente queda mudo).

Error cometido dos veces implementando el fix del incidente 2026-07-31: crear `.channel(`mesa-payment:${mesa}`)` o `.channel(`mesa-orders-broadcast-${mesaId}`)` (nombres únicos por instancia, el hábito correcto para `postgres_changes`) para escuchar un broadcast — nunca llegaba nada porque el trigger manda a `'mesa-sesion-update'` literal, no a esos nombres. Filtrar por mesa/sesión debe hacerse **dentro** del handler, leyendo el payload (`message.payload['mesaId'] !== mesaId`), no en el nombre del canal.
