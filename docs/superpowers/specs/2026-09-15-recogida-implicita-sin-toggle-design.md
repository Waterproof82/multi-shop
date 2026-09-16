# Diseño: recogida en tienda implícita, sin toggle ni configuración

Fecha: 2026-09-15
Feature base: `feat/tienda-recogida-domicilio` + `feat/mejoras-ui-modalidades-entrega` (ya mergeadas a `main`)

## Contexto

El usuario pidió que "Recogida en tienda" deje de ser un toggle/modalidad
configurable — pasa a ser el comportamiento **implícito y gratuito** de
cualquier pedido de tienda que no elija envío a domicilio. El único control
que queda en el admin es "Envío a domicilio habilitado" (sí/no).

Decisiones tomadas en la conversación (no asumidas, preguntadas una por
una):
1. Un pedido sin envío a domicilio debe seguir persistiendo
   `modalidad_entrega_tipo = 'recogida'` — el panel admin (badge de
   `page.tsx`, Task 19 de la sesión anterior) sigue funcionando igual.
2. Recogida pasa a ser 100% fija en el código — sin fila en
   `modalidades_entrega`, sin pantalla de admin para configurarla.
3. Las filas `tipo = 'recogida'` que ya existen en la base (creadas antes de
   este cambio) se borran en la migración.
4. **UI del carrito**: no son dos tabs. Es **una sola lista**: "Recoger en
   local" aparece siempre como primer ítem, preseleccionado, fijo en código.
   Si el envío a domicilio está habilitado, debajo se listan sus modalidades
   reales como alternativas — elegir una las selecciona; volver a tocar
   "Recoger en local" vuelve a la recogida. Si el envío a domicilio está
   deshabilitado, no se muestra nada — el pedido queda como recogida sin que
   el cliente vea ni toque nada.

## Verificado antes de diseñar

- `PedidoUseCase.revalidarModalidadEntrega` (pedido.use-case.ts:489-513) hoy
  retorna `tipo: undefined` (no persiste nada) cuando no llega
  `modalidad_entrega_id` — incluso para tienda. Hay que cambiar esa rama para
  que devuelva `tipo: 'recogida'` en vez de `undefined`.
- `buildModalidadPayload` (pedido.use-case.ts:526-542) hoy exige
  `data.modalidad_entrega_id` truthy para persistir cualquier cosa — hay que
  sacar esa exigencia para que persista `modalidad_entrega_tipo: 'recogida'`
  con `modalidad_entrega_id: null`.
- `pedidos.modalidad_entrega_id` ya es nullable con `ON DELETE SET NULL`
  (migración `20260914000001`, Task 18 de la sesión anterior) — no hace
  falta tocar la FK para permitir `NULL`.
- `usaWizardTienda` (cart-drawer.tsx:967-973) hoy es
  `!isRestaurant && !mesaToken && (recogidaHabilitada || envioHabilitado)` —
  pierde el parámetro `recogidaHabilitada`.
- `admin-sidebar.tsx:181` tiene un comentario (no código) que menciona
  `recogida_tienda_habilitada` — se actualiza el comentario, la lógica de
  esa función (`isItemVisible`, gateada por `isTienda`) no depende del campo,
  no hay que tocar código ahí.
- `getTiendaModalidadBadgeInfo`/`renderOrigenBadge` (`page.tsx`, Task 19) leen
  `pedido.modalidad_entrega_tipo`/`direccion_entrega` directo de la fila — no
  necesitan `modalidad_entrega_id` para nada. Sin cambios.

## Diseño

### 1. Backend — persistencia implícita

`revalidarModalidadEntrega`: cuando `empresaTipo === 'tienda'` y no llega
`modalidad_entrega_id`, en vez de `{ precioCents: 0, tipo: undefined }`
devuelve `{ precioCents: 0, tipo: 'recogida' }`. La rama
`empresaTipo !== 'tienda'` (restaurante/mesa) sigue devolviendo `undefined`
— sin cambios para esos flujos.

`buildModalidadPayload`: la guarda pasa de
`if (!data.modalidad_entrega_id || !modalidadTipoValidado) return undefined;`
a `if (!modalidadTipoValidado) return undefined;`. El objeto devuelto incluye
`modalidad_entrega_id: data.modalidad_entrega_id ?? null` en vez de asumir
que siempre viene un id.

El cliente **nunca** manda `modalidad_entrega_id` ni `modalidad_entrega_tipo`
para recogida — solo los manda cuando el customer elige explícitamente una
modalidad de domicilio real. El servidor infiere `'recogida'` únicamente por
la ausencia de `modalidad_entrega_id` en un pedido de tienda.

### 2. Admin — sin toggle, sin CRUD de recogida

- `TiendaDeliverySettings.tsx`: se elimina el toggle "Recogida en tienda" y
  el bloque `{recogidaHabilitada && <ModalidadesEntregaForm tipo="recogida" ...>}`
  completo. Solo queda el toggle de "Envío a domicilio" y su formulario.
- `ModalidadesEntregaForm.tsx`: pierde la prop `tipo` (ya no hace falta
  distinguir — solo se llama para domicilio). Se elimina toda rama
  condicionada a `tipo === 'recogida'`/`tipo === 'domicilio'` — el
  componente pasa a asumir domicilio siempre (campos de tiempo siempre
  visibles, sin condicional).
- `src/app/admin/(protected)/delivery/page.tsx`: deja de pasar
  `recogidaHabilitada`/`empresa.recogidaTiendaHabilitada` a
  `TiendaDeliverySettings`.
- API `/api/admin/modalidades-entrega`: sin cambios de ruta — como el admin
  ya no puede mandar `tipo: 'recogida'` desde la UI, alcanza con que el
  schema deje de aceptarlo (ver Testing).

### 3. Carrito — lista única, recogida fija primero

`TiendaFulfillmentSelector.tsx` se reescribe: sin tabs, sin prop
`recogidaHabilitada`/`modalidadesRecogida`. Nueva forma:

- Si `envioHabilitado` es `false`, o es `true` pero no hay ninguna modalidad
  de domicilio activa: el componente retorna `null` (nada visible — mismo
  criterio que hoy usa `debeMostrarSelector` para domicilio solo).
- Si hay al menos una modalidad de domicilio activa: se renderiza **una
  lista única** (`<ul>`), cuyo primer `<li>` es la entrada fija de recogida
  (🏪, texto de "Recoger en local", "Gratis"), seguida de las modalidades de
  domicilio reales (mismo layout de fila que ya existe: icono, nombre en
  negrita, precio+tiempo a la derecha).
- Selección: por defecto (`value` inicial `null` desde el padre) se
  considera seleccionada la fila de recogida. Click en una fila de domicilio
  la selecciona (dispara `onChange('domicilio', id, precioCents)`) y
  despliega `MapboxAddressInput` debajo de la lista. Click de vuelta en la
  fila de recogida dispara `onChange('recogida', null, 0)` y oculta el input
  de dirección.
- `onChange`'s segundo parámetro (`modalidadId`) pasa a ser
  `string | null` (antes `string`) para poder representar la fila de
  recogida sin id real.

`cart-drawer.tsx`:
- `usaWizardTienda` pierde el parámetro `recogidaHabilitada`:
  `!isRestaurant && !mesaToken && envioHabilitado`.
- `CartDrawerProps`/`client-menu-page.tsx` dejan de threadear
  `recogidaTiendaHabilitada`.
- El estado `modalidadEntregaId` pasa a tipo `string | null` (ya lo era) y
  puede quedar en `null` con `modalidadEntregaTipo === 'recogida'` de forma
  válida y persistente (no solo como "nada seleccionado todavía").

### 4. Dominio y DB — retirar el campo y las filas viejas

- `Empresa.recogidaTiendaHabilitada` (types.ts), `UpdateEmpresaData`
  (IEmpresaRepository.ts), `recogida_tienda_habilitada` en
  `empresa.dto.ts`, y su mapeo en `SupabaseAdminRepository.ts` /
  `supabase-empresa.repository.ts` (`CAMPOS_DIRECTOS`, `getById`'s SELECT) —
  se eliminan todos, no se dejan como flags muertos.
- Migración nueva:
  ```sql
  DELETE FROM public.modalidades_entrega WHERE tipo = 'recogida';
  ALTER TABLE public.empresas DROP COLUMN recogida_tienda_habilitada;
  ```
  (Verificar en vivo antes de escribir el DELETE cuántas filas hay, igual
  que se hizo en la migración de la Task 1 del plan anterior — no asumir.)
- El `CHECK (tipo IN ('recogida', 'domicilio'))` de la columna
  `modalidades_entrega.tipo` y el `CHECK precio_cero_en_recogida` de la
  migración anterior **no se tocan** — quedan como restricciones vigentes
  pero vacías (ninguna fila `recogida` los va a evaluar nunca más). Evita
  churn de esquema innecesario; el gate real está en el Zod de creación.
- `createModalidadEntregaSchema` (modalidad-entrega.dto.ts): el campo `tipo`
  pasa a `z.literal('domicilio')` — la API rechaza crear una fila
  `tipo: 'recogida'` nueva, defensa en profundidad más allá de que la UI ya
  no lo mande.

## Fuera de alcance

- No se toca el sistema Glovo/Redsys de restaurante.
- No se agrega ninguna forma de reactivar/configurar "recogida" en el
  futuro — si se necesita, es una feature nueva, no una reversión de esto.
- El popup de imagen de producto (segundo pedido del usuario) queda para un
  ciclo de diseño separado.

## Testing

- `tests/ui/tienda-fulfillment-selector.test.tsx`: reescritura mayor — sin
  aserciones de `role('tab')`; nuevos casos: "sin domicilio habilitado no
  renderiza nada", "con domicilio habilitado, recogida aparece primera y
  preseleccionada", "elegir una modalidad de domicilio la selecciona y
  muestra el input de dirección", "volver a click en recogida deselecciona
  domicilio y oculta el input de dirección".
- `tests/ui/cart-drawer-wizard-tienda.test.tsx`: casos de `usaWizardTienda`
  actualizados (ya no toma `recogidaHabilitada`); un caso nuevo que confirme
  que con `envioDomicilioHabilitado: false` el wizard no se activa y no se
  renderiza ningún selector.
- `tests/core/pedido-modalidad-revalidacion.test.ts`: caso nuevo — pedido de
  tienda sin `modalidad_entrega_id` en el body persiste
  `modalidad_entrega_tipo: 'recogida'` y `modalidad_entrega_id: null`.
- `tests/core/modalidad-entrega-dto.test.ts`: caso nuevo — `safeParse` con
  `tipo: 'recogida'` en `createModalidadEntregaSchema` falla.
- `tests/ui/modalidades-entrega-form.test.tsx` /
  `tests/ui/tienda-delivery-settings.test.tsx`: se eliminan los casos que
  ejercitaban `tipo="recogida"`/el toggle de recogida; se ajustan los que
  queden a la nueva forma sin la prop `tipo`.
