# Menús Virtuales

## Qué es

Árboles de navegación **adicionales** sobre el catálogo público, que agrupan productos ya existentes por asociación many-to-many en vez de por `productos.categoria_id` (1:1, jerarquía real). Permite navegar el mismo catálogo de dos formas a la vez — ej. una tienda de baterías: por marca (categoría real "Baterías" → "Exide"/"Varta") **y** por tipo de vehículo (menú virtual "Vehículos" → "Coches"/"Motos"), donde la misma batería aparece en ambos árboles sin duplicarse ni moverse de categoría real.

100% aditivo: no toca `categorias`/`productos.categoria_id` ni su jerarquía. Sin gating por `empresa.tipo` — cualquier empresa puede usarlo.

Spec y plan completos (con todas las decisiones de diseño y el detalle fase a fase): `docs/superpowers/specs/2026-09-16-menus-virtuales-design.md` y `docs/superpowers/plans/2026-09-16-menus-virtuales.md`.

## Tablas DB

| Tabla | Descripción |
|---|---|
| `menus_virtuales` | Árbol self-referencing. `padre_id IS NULL` = menú de nivel superior; `padre_id` no nulo = subcategoría (hoja). `ON DELETE CASCADE` en `padre_id`: borrar el padre borra sus hijos. |
| `menu_virtual_productos` | Join m2m entre un nodo **hoja** y `productos`. `empresa_id` denormalizado (mismo patrón que `producto_complemento_grupos`) para poder filtrar RLS y hacer el `DELETE` de `setProductos` sin JOIN. `UNIQUE(menu_virtual_id, producto_id)`. |

Migraciones: `20260916000003_menus_virtuales.sql`, `20260916000004_menu_virtual_productos.sql`.

No hay validación a nivel DB de que `menu_virtual_id` sea una hoja (sin hijos) — lo garantiza la UI de admin, igual que `categorias` tampoco impide hoy productos colgando de un nodo con subcategorías.

## RLS — different del resto del catálogo

`categorias`/`productos` tienen SELECT público (`TO public USING true`) porque el catálogo se sirve con `getSupabaseAnonClient()`. Los menús virtuales, en cambio, **niegan anon del todo** (`AS RESTRICTIVE ... USING (false)`) — se sirven con `getSupabaseClient()` (service_role), mismo patrón que `producto_complemento_grupos`. No confundir: si algún día se lee esta tabla con el cliente anon, el catálogo público se queda sin menús virtuales silenciosamente (RLS bloquea, no rompe visualmente).

## Arquitectura de capas

```
MenuVirtual (types.ts)                    → entidad de dominio
IMenuVirtualRepository                    → interfaz (findAllByTenant, findAsignacionesByTenant,
                                             create/update/delete, setProductos, addProductos)
SupabaseMenuVirtualRepository             → implementación (reintenta errores transitorios de
                                             PostgREST en los métodos que usa GetMenuUseCase)
MenuVirtualUseCase                        → CRUD fino para el admin, delega ~1:1 al repo
menu-virtual.dto.ts                       → schemas Zod (create/update, setMenuVirtualProductosSchema)
```

`getMenuVirtualRepository()`/`getMenuVirtualUseCase()` en `src/core/infrastructure/database/index.ts`, mismo patrón singleton que `getComplementoGrupoRepository()`.

## Cómo se integra al catálogo público

`GetMenuUseCase` tiene una 4ª dependencia, `menuVirtualRepo` (constructor). El único call site es `getMenuUseCase()` en `src/lib/server-services.ts`.

Al final de `execute()`, un método privado `construirMenusVirtuales` arma los nodos virtuales como `MenuCategoryVM[]` y se **mezclan por `orden`** con las categorías reales (no se concatenan al final):

```ts
const todasLasCategorias = [...menu, ...menuVirtualVMs].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
return { data: todasLasCategorias.filter(categoria => categoria.items.length > 0) };
```

Sort estable (ES2019+): a igual `orden` (ej. ambos en el default `0`), las categorías reales mantienen su posición antes que las virtuales porque llegan primero en el spread. El admin puede intercalar libremente un menú virtual entre dos categorías reales ajustando su `orden` desde `/admin/menus-virtuales` (mismo campo `orderLabel` que ya existe en `/admin/categorias`).

**Best-effort**: si `findAllByTenant`/`findAsignacionesByTenant` fallan, `construirMenusVirtuales` devuelve `[]` — la carta se sirve igual sin menús virtuales, mismo criterio que ya usa `cargarComplementos`. Ninguna de las dos queries rompe el catálogo real.

Es la primera vez que el catálogo público mezcla categorías reales (`categoria_id`) con categorías sintéticas (asociación m2m) en el mismo array `MenuCategoryVM[]` — el precedente ya existía en el propio código con la categoría sintética `__search_results__` del buscador in-place.

## Mapper — `toVirtualCategoryVM` / `toVirtualSubcategoryVM`

En `src/core/application/mappers/menu.mapper.ts`. Misma forma de salida que `toCategoryVM`, pero resuelve `items`/`products` cruzando la tabla de asignaciones contra `productosPorId` en vez de filtrar por `categoriaId`.

**Gotcha con el filtro de categorías vacías:** `GetMenuUseCase.execute()` descarta cualquier `categoria` con `items.length === 0` — evalúa solo `items`, no `subcategories`. Por eso `toVirtualCategoryVM` puebla `items` del nodo padre como la **unión de todos los productos de sus hojas** (con duplicados posibles si un producto está en más de una hoja), igual que `toCategoryVM` hace con `combinedProducts`. Si un futuro cambio dejara `items` del padre vacío confiando en que los datos están en `subcategories`, un menú virtual con productos solo en subcategorías se descartaría por error.

Otros criterios del mapper:
- Excluye productos con `activo === false` (igual que `toCategoryVM` con categorías reales).
- Asociación huérfana (producto borrado): el cruce contra `productosPorId` no lo encuentra y lo omite sin romper.
- Propaga `complementGroups` del sistema nuevo de complementos a los items vistos desde un menú virtual (vía `mapComplementoGrupoToGroupVM`, exportado desde `menu.mapper.ts` para reuso).
- `orden` se propaga a `MenuCategoryVM.orden` tanto en `toCategoryVM` como en `toVirtualCategoryVM` — es lo que consume el merge-sort de arriba.

## Dos vías de escritura — no confundir

| Método | Endpoint | Semántica | Dónde se usa |
|---|---|---|---|
| `setProductos` | `PUT /api/admin/menus-virtuales/[id]/productos` | **Reemplaza-todo** (DELETE + INSERT) | Pantalla de árbol `/admin/menus-virtuales`, al editar un nodo hoja |
| `addProductos` | `POST /api/admin/menus-virtuales/[id]/productos` | **Aditivo** — `upsert(..., { ignoreDuplicates: true })`, nunca borra asociaciones previas, `orden` continúa desde el final de lo ya asociado | Asignación masiva desde `/admin/productos` (selección múltiple con checkboxes) |

Confundirlas es el bug más fácil de introducir: usar `setProductos` en el flujo de asignación masiva borraría todo lo que un nodo ya tenía asociado antes de la selección actual.

## Admin UI

- **`/admin/menus-virtuales`** — pantalla master-detail (mismo patrón que `/admin/complementos`): árbol de nodos a la izquierda, panel de edición a la derecha. Nodo padre: nombre + traducciones + `orden`. Nodo hoja: nombre + `orden` + selector de productos con buscador (guarda vía `setProductos`, reemplaza-todo).
- **`/admin/productos`** — selección múltiple (checkboxes en tabla desktop y tarjetas mobile) + botón "Asignar a menú virtual" → dialog con los nodos hoja disponibles → `addProductos` (aditivo). Los nodos hoja se calculan como los que no tienen hijos (`hijosDe(id).length === 0`).

## Gotcha general descubierto en el camino (no específico de este feature)

Al ejercitar de punta a punta el `POST` de asignación masiva apareció un bug **sistémico preexistente** en `successResponse` (`src/core/infrastructure/api/helpers.ts`): `NextResponse.json(undefined, ...)` lanza `"Value is not JSON serializable"`. Afecta a **cualquier** endpoint admin que devuelva `Result<void>` (deletes, sets) — no solo a menús virtuales — porque nunca se había ejercitado un endpoint void de punta a punta hasta esta feature. Fix: serializar `data ?? null` antes de responder (commit `60d46498`). Si se agrega un endpoint nuevo que retorne `Result<void>`, ya no hace falta ningún workaround — el helper compartido lo maneja.

## Testing

- `tests/compliance/menu-virtual-mapper.test.ts` — `toVirtualCategoryVM`/`toVirtualSubcategoryVM`: unión de items del padre, exclusión de inactivos, asociaciones huérfanas, subcategoría vacía, duplicado entre hojas.
- `tests/compliance/menu-agrupacion.test.ts` — orquestación de `GetMenuUseCase` con menús virtuales (no fuerza dedup entre reales y virtuales, degrada bien si el repo de virtuales falla).
- Interleaving por `orden`: cubierto con `orden` explícito y en sentido inverso al orden de llegada — el primer test que se escribió pasaba solo por empate en `orden: 0`, no probaba el comparador real.
