# Diseño: mejoras de UI y simplificación de "recogida" en modalidades de entrega

Fecha: 2026-09-15
Feature base: `feat/tienda-recogida-domicilio` (ya mergeada a `main`)

## Contexto

Tras verificar en vivo (navegador real, empresa "Mermelada de Tomate") que el
feature de recogida/domicilio funciona end-to-end, el usuario reportó 4
problemas de UI/UX que este diseño resuelve:

1. Los iconos de cada modalidad no aparecen en el carrito del cliente.
2. La lista de "Envío a domicilio" es poco clara — pidió algo más ordenado.
3. "Recogida en tienda" siempre va a ser gratis para este negocio, y no
   debería mostrarse como si tuviera categorías/precio.
4. Los colores del panel admin de "Zona de entrega" no se leen bien.

Verificado antes de diseñar (no asumido):
- El icono SÍ se pinta en el panel admin (`ModalidadesEntregaForm.tsx:87-89`)
  — el bug es únicamente en el selector del carrito
  (`TiendaFulfillmentSelector.tsx`), que declara el campo `icono` pero nunca
  lo renderiza.
- El sistema hoy permite que "recogida" tenga precio > 0 (el `.superRefine()`
  de `modalidad-entrega.dto.ts` solo restringe los campos de TIEMPO para
  recogida, nunca el precio) — confirmado leyendo el schema real. El pedido
  del usuario de "eliminar el precio de recogida del sistema" es un cambio de
  alcance deliberado sobre esa decisión anterior, no una corrección de un bug.
- El bug de color es real: el `<span>` que pinta el nombre de la modalidad en
  `ModalidadesEntregaForm.tsx:90` no tiene ninguna clase de color de texto, y
  el resto del componente usa tokens de tema (`text-foreground`,
  `text-muted-foreground`) calibrados para la tienda pública (clara,
  tenant-customizable), mientras que el resto del panel admin en la misma
  página (`DeliveryCredentialsForm`, sección Glovo) usa clases fijas
  (`text-white`, `bg-white/5`, `border-white/10`) para el tema oscuro del
  admin. Dos sistemas de color mezclados en la misma pantalla.

## Decisiones (aprobadas visualmente por el usuario)

### 1. Recogida pasa a ser SIEMPRE gratis, en todo el sistema

No es una simplificación de UI nomás — se elimina el precio de recogida del
modelo de datos para toda empresa tipo tienda, no solo esta.

- **Server-side (obligatorio)**: `createModalidadEntregaSchema`/
  `updateModalidadEntregaSchema` rechazan `precioCents !== 0` cuando
  `tipo === 'recogida'` (mismo patrón `.superRefine()` que ya existe para los
  campos de tiempo — agregar el precio a esa misma validación cruzada).
- **DB**: nuevo CHECK constraint `precio_cero_en_recogida` en
  `modalidades_entrega` (`tipo = 'domicilio' OR precio_cents = 0`), y
  migración que pone en 0 cualquier fila `recogida` existente con precio > 0
  (defensivo — a la fecha de este diseño solo existen filas de prueba, pero
  no asumir sin mirar la DB antes de escribir la migración).
- **Admin (`ModalidadesEntregaForm.tsx`)**: el input "Precio (€)" se oculta
  cuando `tipo === 'recogida'` (mismo patrón que ya usan los inputs de
  tiempo, que solo se muestran `tipo === 'domicilio'`). El submit manda
  `precioCents: 0` fijo para recogida, sin input.
- **Impacto en tests existentes**: `tests/ui/cart-drawer-wizard-tienda.test.tsx`
  tiene un caso ("Recogida rápida", 150 cents) y
  `tests/core/pedido-modalidad-revalidacion.test.ts` puede tener fixtures
  similares — se actualizan a `precioCents: 0` para recogida, preservando lo
  que cada test verifica de fondo (no se borra cobertura, se corrige el dato
  de entrada).

### 2. `TiendaFulfillmentSelector.tsx` — rediseño visual (opción B + A del brainstorming)

**Domicilio** (opción B "lista compacta con ícono"): cada fila muestra el
emoji del icono a la izquierda, nombre en negrita ocupando el espacio
disponible, precio+tiempo en gris chico a la derecha, borde de color
(`border-primary`) en la fila seleccionada. Es la estructura que ya existe
hoy — el cambio real es que el icono por fin se pinta, y se ajusta jerarquía
tipográfica (negrita en nombre, gris chico en precio/tiempo, en vez del
mismo peso para todo).

**Recogida** (opción A "línea de confirmación, sin click"):
- Si hay **una sola** modalidad de recogida activa: se pinta como una línea
  fija no interactiva (mismo layout de fila que domicilio: icono + nombre +
  a la derecha "✓ Gratis" en vez de precio), sin `<button>`, sin lista. Ya
  está "seleccionada" — no hace falta click porque no hay nada para elegir.
- Si hay **dos o más** modalidades de recogida activas (caso futuro, poco
  común): se muestra como lista clickeable, mismo patrón visual que
  domicilio opción B, pero la columna de la derecha siempre dice "Gratis" en
  vez de un precio (ya que el precio de recogida es siempre 0 por la
  decisión #1).
- Función pura nueva `debeSerListaORecogida(modalidades: ModalidadEntregaPublica[]): boolean`
  (o nombre equivalente) decide cuál de los dos casos aplica — mismo patrón
  de "tabla de reglas que devuelve el motivo/vista" que ya usa el resto del
  codebase (ver `docs/context/deuda-complejidad.md`).

### 3. Colores del panel admin — alinear con el tema oscuro fijo existente

`TiendaDeliverySettings.tsx` y `ModalidadesEntregaForm.tsx` dejan de usar
tokens de tema (`text-foreground`, `text-muted-foreground`, `border-border`,
`bg-background`) y pasan a usar las mismas clases fijas que ya usa
`DeliveryCredentialsForm.tsx` en la misma página: texto blanco
(`text-white`)/gris claro (`text-slate-400` o similar) para labels
secundarios, bordes y fondos translúcidos blancos
(`border-white/10`, `bg-white/5`). El nombre de cada modalidad
(`ModalidadesEntregaForm.tsx:90`) gana la clase de color que le falta.

Esto es una excepción deliberada a la regla general de "nunca hardcodear
colores, usar variables CSS del tenant" de `CLAUDE.md` — esa regla aplica a
la tienda pública (customizable por tenant), no al shell del panel admin,
que ya tiene su propio tema oscuro fijo en el resto de sus pantallas.

## Fuera de alcance

- No se rediseña el resto del panel admin (solo la pantalla de "Zona de
  entrega" que motivó el reporte).
- No se agrega edición de modalidades existentes desde el admin (ya
  documentado como pendiente en el plan original, Task 19bis/M6 — sigue sin
  tocarse acá).
- No se cambia el comportamiento de "Envío a domicilio" más allá del ajuste
  visual — la lógica de selección, validación de dirección y precio server-side
  (Task 18) no se modifica.

## Testing

- `tests/ui/tienda-fulfillment-selector.test.tsx`: nuevos casos para
  "recogida con una sola modalidad → línea fija, sin `role=button` clickeable
  en esa fila" y "recogida con 2+ modalidades → lista, columna derecha dice
  Gratis"; actualizar aserciones existentes que dependan del layout viejo.
- `tests/ui/modalidades-entrega-form.test.tsx`: caso nuevo "input de precio
  no se renderiza cuando tipo=recogida".
- `tests/core/modalidad-entrega-dto.test.ts`: caso nuevo "precioCents > 0 con
  tipo=recogida es rechazado por el schema" (create y update).
- Migración: `pnpm db:smoke` tras aplicarla, más verificación SQL directa de
  que no quedó ninguna fila `recogida` con `precio_cents != 0`.
