# Diseño: rediseño del árbol de Menús Virtuales (admin)

Fecha: 2026-09-21
Pantalla: `src/app/admin/(protected)/menus-virtuales/page.tsx`

## Contexto

El usuario pidió modernizar el diseño y la UX de "menús virtuales" — tanto al
crear nodos como al ver lo ya creado. Tras brainstorming con mockups visuales
(guardados en `.superpowers/brainstorm/25321-1790013023/content/`), se
descartó explícitamente:

- Cambiar cómo se asocian productos a un nodo hoja (el usuario confirmó que
  esa parte ya le resulta cómoda).
- Agregar previsualización del catálogo público — el pedido de "ver lo
  creado" se refiere únicamente al árbol del propio panel admin, no a cómo
  se ve puesto en la tienda.

El problema reportado es puntual: la pantalla actual es una lista de botones
planos sin jerarquía visual (mismo tamaño/peso para "menú" y
"subcategoría"), sin contador de contenido por nodo, y el flujo de creación
crea el registro en la base con un nombre placeholder ("Nuevo menú") antes
de que el usuario escriba nada — confuso porque no queda claro que ya se
creó algo hasta que se nota el input de nombre poblado.

Verificado antes de diseñar:
- No hay ninguna librería de drag-and-drop en `package.json` — se agrega
  `@dnd-kit/core` + `@dnd-kit/sortable` como dependencia nueva (decisión
  explícita del usuario, con el trade-off de bundle/dependencia planteado).
- Ya existe un sistema de toasts (`src/hooks/use-toast.ts` +
  `src/components/ui/toaster.tsx`, sobre `@radix-ui/react-toast`) y un
  patrón de diálogo de confirmación de borrado
  (`DeleteConfirmDialog` en `src/components/admin/product-form-dialog.tsx`,
  reusado por `productos/page.tsx`). La pantalla de menús virtuales es la
  única en el admin que todavía usa `alert()`/`confirm()` nativos — se
  alinea con el resto en vez de inventar un patrón nuevo.
- `MenuVirtual.padreId` limita la jerarquía a 2 niveles (padre/hijo) — el
  rediseño no cambia el modelo de datos, solo cómo se presenta.

## Decisiones (aprobadas visualmente por el usuario — opción A + modal + drag&drop real)

### 1. Árbol — jerarquía visual clara (opción A del brainstorming)

- Icono por tipo de nodo: 🍽️/`Grid2X2`-style para menú raíz (sin `padreId`),
  icono distinto para subcategoría (hoja). Reusar iconos de `lucide-react`
  ya importados en el proyecto en vez de emojis — los emojis en el mockup
  eran solo para maquetar rápido en el navegador.
- Badge de conteo junto al nombre: subcategorías para un padre, productos
  asociados para una hoja. Se deriva de datos que ya se cargan
  (`nodos`, `selectedProductoIds` no aplica al listado — para el conteo de
  productos por nodo hoja en la lista hace falta un fetch adicional liviano,
  ver "Impacto en API" más abajo).
- Estado vacío por nodo: si un padre no tiene hijos y tampoco tiene
  productos asociados directamente, se etiqueta "(vacío)" en gris junto al
  nombre — hoy esa información no es visible sin hacer clic.
- Breadcrumb en el panel de edición: `Padre › Hijo` cuando el nodo
  seleccionado tiene `padreId`, solo el nombre cuando es raíz.

### 2. Reordenar — drag & drop real con `@dnd-kit`

- Nueva dependencia: `@dnd-kit/core`, `@dnd-kit/sortable`,
  `@dnd-kit/utilities`.
- `DndContext` + `SortableContext` envolviendo la lista de padres, y una
  instancia anidada por cada grupo de hijos (dos niveles de sortable
  independientes — un hijo no puede arrastrarse fuera de su padre en esta
  iteración, evita tener que resolver reparenting en el mismo cambio).
- Al soltar, se recalculan los valores de `orden` de los nodos afectados
  (enteros consecutivos) y se persisten con el mismo endpoint `PUT
  /api/admin/menus-virtuales/[id]` que ya existe, uno por nodo modificado.
- El input numérico de `orden` se elimina del formulario de edición — el
  campo sigue existiendo en el modelo/API, pero ya no se edita a mano.

### 3. Crear — diálogo modal en vez de creación inmediata

- Nuevo componente `NuevoMenuVirtualDialog` (mismo patrón `Dialog` /
  `DialogContent` / `DialogHeader` que `product-form-dialog.tsx`), con un
  input de nombre y, si se abrió desde "+ Nueva subcategoría", el padre ya
  queda fijo (no hace falta selector — se abre con contexto).
- El POST a `/api/admin/menus-virtuales` solo se dispara al confirmar el
  diálogo con un nombre no vacío. Se elimina el patrón actual de crear con
  `t('menuVirtualNuevoMenu', language)` como nombre real y dejar editando.
- Nuevas claves de traducción: `menuVirtualCrearTitulo`,
  `menuVirtualCrearSubcategoriaTitulo`, `menuVirtualNombrePlaceholder` (ES/EN,
  siguiendo el bloque existente en `translations.ts` L522-537 / L1586-1601).

### 4. Feedback — banner inline + diálogo de confirmación, sin `alert`/`confirm`

Corrección tras verificar en vivo: `src/hooks/use-toast.ts` y
`src/components/ui/toaster.tsx` existen pero **no se usan en ningún lugar
del código actual** (`<Toaster />` no está montado en ningún layout) — no es
un patrón establecido, es infraestructura huérfana. El patrón que sí usan
todas las pantallas de admin comparables (`productos/page.tsx`,
`categorias/page.tsx`) es un estado local `error` + banner inline
(`{error && <div className="...bg-destructive/10...">{error}</div>}`). Se
sigue ESE patrón para consistencia real, no el hook sin usar:

- `handleGuardarProductos` / `handleGuardarNombre`: el `alert(...)` de error
  y los fallos silenciosos pasan a setear un `error` de estado local,
  mostrado en el mismo banner inline que ya usa el resto del admin.
- `handleEliminar`: el `confirm(...)` nativo se reemplaza por un diálogo de
  confirmación local (mismo look que `DeleteConfirmDialog`, pero definido en
  este archivo — no se importa el de `product-form-dialog.tsx` porque ese
  componente está acoplado a `productName`/claves de traducción de
  producto; se replica el patrón visual, no el componente).
- `handleGuardarNombre`: agrega un toast de éxito/error (hoy falla en
  silencio si `res.ok` es `false`).

### Impacto en API

Para pintar el badge de "N productos" en nodos hoja, no hace falta SQL
nuevo: `IMenuVirtualRepository.findAsignacionesByTenant` ya trae **todas**
las asociaciones `(menuVirtualId, productoId)` de la empresa en una sola
query (la usa `get-menu.use-case.ts` para el catálogo público). Se agrega
`MenuVirtualUseCase.getProductCounts(empresaId)`, que llama a ese mismo
método y agrupa en memoria (`Map<menuVirtualId, number>`). El route handler
de `GET /api/admin/menus-virtuales` combina ambas respuestas
(`getAll` + `getProductCounts`) y devuelve cada nodo con un campo
`productosCount` agregado — sin tocar `MenuVirtual` (tipo de dominio
compartido con la asignación masiva desde `productos/page.tsx`), solo el
shape de la respuesta de este endpoint.

## Fuera de alcance

- No se toca el flujo de asociación de productos a un nodo hoja (buscador +
  checkboxes) — confirmado cómodo por el usuario.
- No se agrega previsualización del catálogo público desde este panel.
- No se permite reparenting por drag & drop (mover un hijo a otro padre, o
  un padre a hijo) — solo reordenar dentro del mismo nivel/padre.
- No se cambia el límite de 2 niveles de jerarquía (`padreId` sigue siendo
  nullable, sin anidamiento más profundo).
- No se modifica la pantalla de asignación masiva de productos
  (`menuVirtualAsignarAMenu` y relacionados, usada desde `productos/page.tsx`)
  más allá de que ambas pantallas ya comparten el mismo sistema de toasts.

## Testing

- Tests de componente para `menus-virtuales/page.tsx` (no existen hoy, a
  crear): crear nodo vía diálogo no dispara POST hasta confirmar con nombre
  no vacío; cancelar el diálogo no crea nada; reordenar (simulando el evento
  de `@dnd-kit`) persiste el nuevo `orden` vía PUT; eliminar pasa por el
  diálogo de confirmación, no por `window.confirm`.
- Caso de conteo: nodo padre sin hijos y sin productos se marca "(vacío)";
  nodo con hijos no vuelve a listarse como hoja (ya cubierto por
  `selectedEsHoja`, solo verificar que el badge muestra el número correcto).
- `pnpm lint && pnpm build` tras el cambio (regla del proyecto) — prestar
  atención a S3776 en el nuevo handler de drag end si termina con lógica de
  recálculo de `orden` no trivial (extraer a función pura si supera la
  complejidad permitida).
