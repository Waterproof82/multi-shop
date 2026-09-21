# Diseño: Menús virtuales (categorías de navegación adicionales sobre productos existentes)

**Fecha:** 2026-09-16
**Disparador:** una tienda de repuestos (baterías) quiere que el mismo catálogo se pueda navegar de dos formas: por marca (categoría real "Baterías" → subcategorías "Exide"/"Varta", ya existente) y por tipo de vehículo (menú nuevo "Vehículos" → "Coches"/"Motos"), donde cada batería puede aparecer en "Baterías" Y en la subcategoría de vehículo que corresponda, sin duplicar el producto ni moverlo de categoría real.

## Objetivo

Permitir crear árboles de navegación adicionales ("menús virtuales") que referencian productos ya existentes por asociación (many-to-many), en vez de por `productos.categoria_id` (que es 1:1 y pertenece a la jerarquía real de `categorias`). Un menú virtual aparece en el catálogo público exactamente igual que una categoría real con subcategorías — mismo componente de render, mismo `CategoryNav`.

## Fuera de alcance

- No se toca `categorias`/`productos.categoria_id` ni su jerarquía real — los menús virtuales son 100% aditivos.
- No hay límite de profundidad más allá de 2 niveles (menú → subcategoría → productos), igual que el límite real que ya tiene `categorias` (`categoria_padre_id` es un único nivel, no hay categoría-de-categoría-de-categoría).
- No se agrega gating por `empresa.tipo` — cualquier empresa (tienda o restaurante) puede usar esta función si le sirve; no es exclusivo de baterías.
- La búsqueda de productos in-place del catálogo público (`client-menu-page.tsx`, feature de hoy) no cambia — un producto que pertenece a un menú virtual sigue apareciendo una sola vez en los resultados de búsqueda porque la dedupe por `id` ya implementada lo cubre sin cambios.

## Modelo de datos

Dos tablas nuevas, mismo patrón (denormalización de `empresa_id`, RLS restrictivo) que ya usa `producto_complemento_grupos` para el sistema de complementos.

### `menus_virtuales`

Nodo de árbol — tanto el menú de nivel superior ("Vehículos") como sus subcategorías ("Coches", "Motos") son filas de esta misma tabla, igual que `categorias.categoria_padre_id`.

```sql
CREATE TABLE public.menus_virtuales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  padre_id uuid REFERENCES public.menus_virtuales(id) ON DELETE CASCADE,
  nombre_es text NOT NULL,
  nombre_en text,
  nombre_fr text,
  nombre_it text,
  nombre_de text,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`padre_id IS NULL` → menú de nivel superior. `padre_id` apuntando a otro nodo → subcategoría. `ON DELETE CASCADE` en `padre_id`: borrar "Vehículos" borra "Coches"/"Motos" en cascada.

### `menu_virtual_productos`

Asociación many-to-many entre un nodo **hoja** (subcategoría) y `productos`.

```sql
CREATE TABLE public.menu_virtual_productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  menu_virtual_id uuid NOT NULL REFERENCES public.menus_virtuales(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (menu_virtual_id, producto_id)
);
```

No hay validación a nivel DB de que `menu_virtual_id` sea una hoja (sin hijos) — lo garantiza la UI de admin (el selector de productos solo se ofrece al entrar a un nodo, y en la práctica un nodo con hijos no necesita productos propios). Igual que `categorias` no impide hoy productos colgando de un nodo con subcategorías.

### RLS y GRANTs

Verificado contra la DB real: `categorias`/`productos` tienen SELECT público (`TO public USING true`), pero `producto_complemento_grupos` **no** — anon bloqueado del todo. La diferencia no es casualidad: en `server-services.ts`, `getMenuUseCase()` arma `SupabaseProductRepository`/`SupabaseCategoryRepository` con `getSupabaseAnonClient()` (por eso esas dos tablas SÍ necesitan SELECT público), pero `getComplementoGrupoRepository()` — inyectado al mismo `GetMenuUseCase` — se instancia en `index.ts` con `getSupabaseClient()` (service_role, bypassea RLS). El nuevo `SupabaseMenuVirtualRepository` se cablea igual que el de complementos (service_role vía `getComplementoGrupoRepository()`-style singleton en `index.ts`), así que puede negar anon del todo sin romper el catálogo público. Mismo patrón de policies para las dos tablas nuevas:

```sql
ALTER TABLE public.menus_virtuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct anon access to menus_virtuales"
  ON public.menus_virtuales AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- get_mi_empresa_id() envuelta en (SELECT ...) para InitPlan (ver CLAUDE.md).
CREATE POLICY "Admin ve menus_virtuales"
  ON public.menus_virtuales FOR SELECT TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));
CREATE POLICY "Admin inserta menus_virtuales"
  ON public.menus_virtuales FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));
CREATE POLICY "Admin edita menus_virtuales"
  ON public.menus_virtuales FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id())) WITH CHECK (empresa_id = (SELECT get_mi_empresa_id()));
CREATE POLICY "Admin elimina menus_virtuales"
  ON public.menus_virtuales FOR DELETE TO authenticated
  USING (empresa_id = (SELECT get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus_virtuales TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus_virtuales TO authenticated;
```

Mismo bloque (sin `UPDATE`, ya que es tabla puente pura: se borra e inserta, no se edita una fila) para `menu_virtual_productos`.

Dos migraciones separadas (`supabase/migrations/`, siguiendo el patrón ya usado en `tabla_plantillas`):
- `20260916000003_menus_virtuales.sql`
- `20260916000004_menu_virtual_productos.sql`

Aplicar con `supabase db push --linked` (nunca `apply_migration`/`execute_sql` suelto — regla del proyecto) y correr `pnpm db:smoke` después.

## Dominio y aplicación

### `src/core/domain/entities/types.ts`

```ts
export interface MenuVirtual {
  id: string;
  empresaId: string;
  padreId: string | null;
  nombre: string; // nombre_es
  translations?: { en?: string; fr?: string; it?: string; de?: string };
  orden: number;
}
```

### `src/core/domain/repositories/IMenuVirtualRepository.ts` (nuevo)

Mismo estilo que `IComplementoGrupoRepository`:

```ts
export interface CreateMenuVirtualData {
  empresaId: string;
  padreId?: string | null;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  orden?: number;
}

export interface IMenuVirtualRepository {
  findAllByTenant(empresaId: string): Promise<Result<MenuVirtual[]>>;
  findProductoIdsByMenuVirtual(menuVirtualId: string, empresaId: string): Promise<Result<string[]>>;
  findAsignacionesByTenant(empresaId: string): Promise<Result<{ menuVirtualId: string; productoId: string }[]>>;
  create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>>;
  update(id: string, empresaId: string, data: Partial<Omit<CreateMenuVirtualData, 'empresaId'>>): Promise<Result<MenuVirtual>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>>;
}
```

`findAsignacionesByTenant` trae TODAS las asociaciones de la empresa de una sola query — es lo que consume `GetMenuUseCase` para no hacer una query por nodo hoja.

`setProductos` es reemplaza-todo (DELETE + INSERT en una transacción), mismo patrón que `setProductoGrupos`.

### `src/core/infrastructure/database/SupabaseMenuVirtualRepository.ts` (nuevo)

Implementación estándar del repo, mismo estilo que `SupabaseComplementoGrupoRepository` (Result<T,E>, `logger.logAndReturnError` en el catch).

### `src/core/application/use-cases/menu-virtual.use-case.ts` (nuevo)

CRUD fino para el admin (crear/editar/borrar nodos, `setProductos`) — delega casi 1:1 al repo, sin lógica de negocio adicional (no la necesita).

### `src/core/application/mappers/menu.mapper.ts` — nueva función

```ts
function toVirtualCategoryVM(
  nodo: MenuVirtual,
  hijos: MenuVirtual[],
  asignaciones: Map<string, string[]>, // menuVirtualId -> productoIds
  productosPorId: Map<string, Product>,
  categoriasPorId: Map<string, Category>,
): MenuCategoryVM
```

Misma forma de salida que `toCategoryVM` (una `MenuCategoryVM` con `subcategories`), pero resuelve `items`/`products` cruzando `asignaciones` contra `productosPorId` en vez de filtrar por `categoriaId`. Reusa `mapProductToItem` tal cual (el nombre de categoría que le pasa es el de la categoría REAL del producto — `categoriasPorId.get(producto.categoriaId)` —, no el nombre del menú virtual; el campo `item.category` es metadata informativa, no afecta el render).

**Importante — `items` del nodo padre debe ser la unión de todos sus hijos**, exactamente como `toCategoryVM` hace con `combinedProducts = [...parentProducts, ...subcategoryProducts]`: el filtro final de `GetMenuUseCase.execute` (`categoria.items.length > 0`) evalúa solo `items`, no `subcategories`, así que si el padre virtual no replica ahí los productos de sus hojas, un menú virtual con productos solo en subcategorías quedaría descartado por error. `toVirtualCategoryVM` arma `items` como la unión (con duplicados, igual que ya hace hoy `toCategoryVM` con las categorías reales) y `subcategories[].products` con el detalle por hoja — mismo patrón, sin casos borde nuevos.

### `src/core/application/use-cases/get-menu.use-case.ts` — extensión de `execute`

El constructor de `GetMenuUseCase` gana una cuarta dependencia:

```ts
constructor(
  private readonly productRepo: IProductRepository,
  private readonly categoryRepo: ICategoryRepository,
  private readonly complementoRepo: IComplementoGrupoRepository,
  private readonly menuVirtualRepo: IMenuVirtualRepository,
) {}
```

Esto rompe el único call site: `getMenuUseCase()` en `src/lib/server-services.ts:16-20`, que pasa a incluir `getMenuVirtualRepository()` (nuevo getter en `index.ts`, mismo patrón que `getComplementoGrupoRepository()` — instanciado con `getSupabaseClient()`, service_role):

```ts
export function getMenuUseCase(): GetMenuUseCase {
  return _menuUseCase ??= new GetMenuUseCase(
    new SupabaseProductRepository(getSupabaseAnonClient()),
    new SupabaseCategoryRepository(getSupabaseAnonClient()),
    getComplementoGrupoRepository(),
    getMenuVirtualRepository()
  );
}
```

Después de construir `menu` (categorías reales, línea actual `~146-157`):

```ts
const menusVirtuales = await this.menuVirtualRepo.findAllByTenant(empresaId);
const asignaciones = await this.menuVirtualRepo.findAsignacionesByTenant(empresaId);
// si cualquiera de las dos falla: no rompe la carta, se sirve sin menús virtuales
// (mismo criterio best-effort que ya usa cargarComplementos)

const asignacionesPorNodo = agruparPor(asignaciones.data, a => a.menuVirtualId); // reusa el helper ya existente
const productosPorId = new Map(productos.data.map(p => [p.id, p]));
const virtualPadres = menusVirtuales.data.filter(m => !m.padreId).sort((a,b) => a.orden - b.orden);
const virtualHijosPorPadre = agruparPor(menusVirtuales.data.filter(m => m.padreId), m => m.padreId!);

const menuVirtualVMs = virtualPadres.map(padre => toVirtualCategoryVM(
  padre,
  virtualHijosPorPadre.get(padre.id) ?? [],
  asignacionesPorNodo,
  productosPorId,
  categoriasPorId,
));

return { data: [...menu, ...menuVirtualVMs].filter(categoria => categoria.items.length > 0) };
```

El filtro no cambia respecto al actual: como `toVirtualCategoryVM` puebla `items` con la unión de todos los productos de sus hojas (ver nota en la sección del mapper), un menú virtual vacío se descarta con el mismo criterio que ya aplica a las categorías reales — sin casos especiales nuevos.

## Admin UI

Nueva pantalla `/admin/menus-virtuales`, agregada al sidebar (`admin-sidebar.tsx`) dentro del grupo `catalogo`, junto a "Categorías"/"Productos"/"Complementos":

```ts
{ href: '/admin/menus-virtuales', labelKey: 'sidebarMenusVirtuales', icon: Layers },
```

Estructura de la pantalla — mismo patrón master-detail que `/admin/complementos/page.tsx`:

- **Columna izquierda:** árbol de menús virtuales (nodo padre expandible → hijos). Botón "Nuevo menú" (crea nodo con `padreId: null`) y, dentro de un nodo padre seleccionado, "Nueva subcategoría" (crea con `padreId` del seleccionado).
- **Panel derecho, nodo padre seleccionado:** edición de nombre (+ traducciones) y orden. Sin selector de productos (los productos van en las hojas).
- **Panel derecho, nodo hoja (subcategoría) seleccionado:** edición de nombre + **selector de productos** — lista de todos los productos de la empresa con buscador (mismo filtro `p.name`/`titulo_es`.toLowerCase().includes(query) que ya se implementó en el catálogo público), checkbox por producto, guarda con `PUT /api/admin/menus-virtuales/[id]/productos` (body: `{ productoIds: string[] }`), reemplaza-todo.

### API routes nuevas (`src/app/api/admin/menus-virtuales/`)

- `GET /api/admin/menus-virtuales` — lista árbol completo de la empresa.
- `POST /api/admin/menus-virtuales` — crea nodo (Zod: `nombre_es` requerido, `padreId` opcional).
- `PUT /api/admin/menus-virtuales/[id]` — edita nodo.
- `DELETE /api/admin/menus-virtuales/[id]` — borra nodo (cascada).
- `PUT /api/admin/menus-virtuales/[id]/productos` — reemplaza-todo de asociaciones (Zod: `productoIds: string[]`).

Todas con `requireRole(request, ['admin', 'superadmin'])`, mismo patrón que el resto de `/api/admin/*`.

## Render público

`client-menu-page.tsx` **no cambia**: como "Vehículos" llega ya mezclado dentro del mismo array `menuData: MenuCategoryVM[]` que devuelve `GetMenuUseCase`, aparece como una entrada más en `CategoryNav` junto a "Baterías" — mismo `MenuSection` renderiza sus subcategorías "Coches"/"Motos" exactamente igual que hoy renderiza "Exide"/"Varta" bajo "Baterías". Ni `MenuSection` ni `CategoryNav` necesitan saber que un nodo es virtual.

## Edge cases

- Producto con `activo = false`: no debe aparecer en el menú virtual. `findAsignacionesByTenant` no filtra por `activo` (no conoce ese campo), así que el filtro se aplica en `toVirtualCategoryVM` al cruzar contra `productosPorId` (excluir si `producto.activo === false`), igual que hace `MenuMapper.toCategoryVM` con las categorías reales.
- Asociación huérfana (producto borrado): el cruce contra `productosPorId` simplemente no encuentra el producto y lo omite — no rompe nada.
- Menú virtual sin productos en ninguna subcategoría: se filtra igual que una categoría real vacía (ver nota del filtro final en `get-menu.use-case.ts` arriba).
- Un producto puede estar en cero, una o varias hojas de menús virtuales (many-to-many real, sin restricción de exclusividad) — no se pidió que sea excluyente y el modelo no lo impide.
- Borrar la categoría REAL de un producto no afecta sus asociaciones a menús virtuales (tablas independientes) — si el producto queda sin categoría real (`categoria_id null`), sigue apareciendo en "Baterías"... salvo que "sin categoría" no se pinte en absoluto en el catálogo real (comportamiento actual, sin cambios) pero SÍ seguiría apareciendo en "Vehículos". Aceptado como comportamiento correcto: son sistemas de navegación independientes.

## Testing

- **Unit:** `toVirtualCategoryVM` — nodo con productos activos e inactivos (excluye inactivos), nodo sin productos (subcategoría vacía), padre con una hoja vacía y otra con productos (el padre se pinta igual), producto en dos hojas distintas (aparece en ambas, no se deduplica entre menús — solo dentro de la búsqueda del catálogo).
- **Unit:** `setProductos` reemplaza-todo — verificar que una segunda llamada con una lista distinta borra las asociaciones viejas que ya no están en la lista nueva.
- **Manual en navegador:** crear "Vehículos" → "Coches"/"Motos" desde el admin, asociar "BATERÍA EXIDE GEL ES900" a "Coches", confirmar que aparece en el catálogo público bajo "Vehículos > Coches" Y sigue apareciendo bajo "Baterías > Exide" sin duplicarse en la búsqueda in-place.
- `pnpm db:smoke` no cubre tablas nuevas directamente, pero corre igual tras el `db push` (checklist obligatorio del proyecto).

## Riesgos / notas

- Esta es la primera vez que el catálogo público mezcla categorías reales (`categoria_id`) con categorías sintéticas (asociación many-to-many) en el mismo array `MenuCategoryVM[]` — el precedente ya existe en el propio código (la categoría sintética `__search_results__` de la búsqueda in-place), así que el patrón de "fabricar una `MenuCategoryVM` sin tocar `MenuSection`" ya está validado en este proyecto.
- Nada de esto toca datos fiscales, `pedidos`, ni RLS de tablas existentes — es aditivo puro.
- Alcance real: 2 migraciones + 1 entidad + 1 repo (interfaz + impl) + 1 use-case + 1 mapper nuevo + extensión de `GetMenuUseCase` + 1 pantalla admin + 4 API routes. Bastante más que "1-2 archivos" — justifica el plan de implementación por tareas en vez de ir directo.
