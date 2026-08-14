# Optimistic UI — borrado de item en ticket de mesa y envío de carrito

## Contexto

Dos flujos del panel de camarero (suplantando mesa) y del checkout general son hoy
100% pesimistas: la UI espera la respuesta del servidor antes de reflejar cualquier
cambio, generando una demora percibida.

1. **Borrar item del ticket** — `mesa-orders-client.tsx` (`handleDeleteItem`,
   línea ~2550). El modal de confirmación queda bloqueado con spinner hasta que
   `DELETE /api/waiter/mesas/[mesaId]/orders/items` responde.
2. **Enviar carrito** — `cart-drawer.tsx`, tanto en modo mesa (`executeMesaOrder`,
   línea ~878) como en checkout general (`submitStandardOrder`, línea ~699). El
   botón de enviar queda deshabilitado (`sending`) hasta que el pedido se confirma
   en el servidor; recién ahí se limpia el carrito y se redirige (Redsys/tracking)
   o se muestra el éxito.

## Objetivo

Que ambos flujos se sientan instantáneos, sin comprometer la integridad de los
datos ni la lógica de negocio ya congelada y testeada (`removeSessionItemUseCase.ts`,
18 tests; reglas de `pedidos` en `CLAUDE.md`: los pedidos **nunca** se encolan para
reintento automático, porque reproducir una comanda minutos después puede mandar
comida a una mesa que ya se levantó).

**Regla de rollback común a ambos flujos:** cualquier falla —de red o del
servidor— se trata igual: se deshace el cambio optimista y se muestra un error
para que el usuario reintente manualmente. No hay cola de reintento automático.

## Flujo 1 — Borrar item del ticket

### Patrón: overlay optimista (no se muta `sessionData`)

En vez de decrementar cantidades directamente sobre `sessionData.orders[].items`
—que obligaría a replicar en el cliente el reparto entre pedidos y la regla
"si es el último item, el pedido se cancela" que vive en
`removeSessionItemUseCase.ts`— se mantiene un mapa local, solo para render:

```ts
type PendingDeleteKey = string; // `${nombre}||${precio}||${complementosKey}`
const [pendingDeleteOverlay, setPendingDeleteOverlay] =
  useState<Map<PendingDeleteKey, number>>(new Map());
```

`allItems` (la vista ya mergeada, línea ~2601) se calcula aplicando el overlay
como resta adicional después de `mergeOrderItems`, antes de renderizar.

### Secuencia

1. Usuario confirma cantidad a borrar en `SelectorDeUnidades` → `handleDeleteItem`
   se dispara.
2. **Inmediato**: `setPendingDelete(null)` (cierra el modal) + se agrega la
   entrada al overlay (la cantidad baja o el item desaparece de `allItems` ya).
3. `DELETE` corre en background (`fetchWithCsrf`, igual que hoy).
4. **Éxito**: `await refresh()` trae el estado real; se limpia la entrada del
   overlay para esa key (ya no hace falta, el dato real coincide).
5. **Falla** (red o servidor): se limpia la entrada del overlay (el item
   "vuelve" a su cantidad anterior) y se muestra un banner corto no bloqueante
   en la pantalla del ticket (no en el modal, que ya está cerrado):
   *"No se pudo eliminar el ítem — intentá de nuevo."* con auto-dismiss o botón
   de cerrar.

### Qué NO cambia

- `removeSessionItemUseCase.ts` y el endpoint `DELETE` — sin tocar.
- El modal `SelectorDeUnidades` / `AvisoItemPreparado` — mismo flujo de
  confirmación, solo que ahora al confirmar cierra al instante en vez de
  esperar.

### Testing

- Nuevo test: al confirmar borrado, el item baja de cantidad en `allItems`
  antes de que el mock de `fetch` resuelva.
- Nuevo test: si el `DELETE` falla (mock 500 o network error), el overlay se
  revierte y aparece el banner de error.
- Los 18 tests existentes de `tests/compliance/mesa-remove-item.test.ts`
  (lógica del use case) no se tocan — siguen validando el backend.

## Flujo 2 — Enviar carrito (mesa + checkout general)

### Patrón: cierre instantáneo + continuación diferida (sin snapshot/restore)

No se clona ni se restaura el array de items del carrito. Los items **no se
tocan** hasta que se conoce el resultado real — así se elimina cualquier riesgo
de que restaurar un snapshot regenere `cartId`s y rompa el diffing de React.

### Secuencia (aplica igual a `executeMesaOrder` y `submitStandardOrder`)

1. Click en "Enviar pedido" → **inmediato**: `closeCart()` +
   `setSendingOverlay(true)` (nuevo estado, overlay de pantalla completa tipo
   "Confirmando pedido...", reutilizando el patrón visual de `OrderToast`).
   Los items del carrito siguen intactos en `cart-context`.
2. El carrito queda bloqueado para edición mientras `sendingOverlay` es `true`
   (mismo criterio que el actual `sending`, que se conserva como flag interno).
3. `fetch` real corre en background (`sendMesaOrderFlow` / `sendStandardOrderFlow`,
   sin cambios en esas funciones).
4. **Éxito**: se ejecuta exactamente el flujo que ya existe —`clearCart()`,
   y según el caso: redirección a Redsys (`submitRedsysPayment`), redirección a
   tracking, o pantalla de éxito (`setOrderSuccess`). El overlay de
   "Confirmando..." es la antesala visual de esa transición: el usuario nunca
   ve el fetch en curso.
5. **Falla** (red o servidor): `setSendingOverlay(false)` + se reabre el drawer
   (`openCart()`, los items siguen ahí) + `setErrors({ general: mensaje })`,
   que ya renderiza el banner existente dentro del carrito
   (`cart-drawer.tsx:1575`, `FieldError` sobre `errors.general`). Sin cambios
   en el mecanismo de banner, solo se dispara con el drawer reabierto.

### Qué NO cambia

- `sendMesaOrderFlow`, `sendStandardOrderFlow`, `submitRedsysPayment`,
  `attemptKey` (idempotencia) — sin tocar.
- El banner de error (`FieldError` + `errors.general`) — se reutiliza tal cual.

### Testing

- Nuevo test: al enviar, el drawer se cierra y aparece el overlay antes de que
  el mock de `fetch` resuelva.
- Nuevo test: si falla, el drawer se reabre con los mismos items y el banner
  de error visible.
- Nuevo test: si tiene éxito, el flujo de redirección/toast existente sigue
  disparándose igual que hoy (regresión).

## Fuera de alcance

- No se modifica ninguna lógica de servidor (use cases, endpoints, triggers).
- No se agrega cola de reintento automático — decisión explícita, alineada con
  la regla de `CLAUDE.md` sobre no encolar pedidos.
- No se toca `usePagoDeMesa` ni el flujo de cobro/división de mesa.
