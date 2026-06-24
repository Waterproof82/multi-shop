# Documentación: Toggle Comida/Bebidas en el Menú

## Resumen

Para empresas de tipo `restaurante`, el menú público muestra un toggle que permite al cliente filtrar las categorías por tipo: **Comida** o **Bebidas**. El toggle solo aparece si la empresa tiene al menos una categoría con `tipo_producto = 'bebida'`.

La clasificación es **a nivel de categoría** — la categoría es la fuente de verdad, no el producto individual.

---

## Base de datos

### `categorias` (delta)
```sql
tipo_producto  TEXT NOT NULL DEFAULT 'comida'
               CHECK (tipo_producto IN ('comida', 'bebida'))
```

### Migración
`supabase/migrations/20260624000002_categorias_tipo_producto.sql`

La migración auto-popula el valor de cada categoría existente mirando sus productos: si algún producto tiene `tipo_producto = 'bebida'`, la categoría queda como `'bebida'`.

---

## Cascade automático

Cuando el admin cambia el `tipo_producto` de una categoría, el repositorio actualiza en cascada todos los productos de esa categoría:

```sql
UPDATE productos
SET tipo_producto = <nuevo_tipo>
WHERE categoria_id = <id>
  AND empresa_id = <empresa_id>
```

Esto garantiza que `productos.tipo_producto` (que se almacena en `detalle_pedido` de cada orden) siempre coincide con la categoría — y el enrutado cocina/bar sigue funcionando correctamente.

### Nuevo producto con categoría asignada

Al crear un producto, el repositorio consulta la categoría y usa su `tipo_producto` como valor inicial, ignorando el default `'comida'`:

```ts
// SupabaseProductRepository.create()
if (data.categoria_id) {
  const { data: cat } = await supabase.from('categorias').select('tipo_producto').eq('id', data.categoria_id).single();
  if (cat) tipoProducto = cat.tipo_producto;
}
```

---

## Cómo funciona

### Clasificación de categorías

`getCategoryTab(cat: MenuCategoryVM)` lee directamente `cat.tipoProducto`:

| Resultado | Criterio |
|---|---|
| `'bebida'` | `cat.tipoProducto === 'bebida'` y tiene items |
| `'comida'` | `cat.tipoProducto !== 'bebida'` y tiene items |
| `'empty'` | Sin items (ni en la categoría ni en sus subcategorías) |

Ya no existe el caso `'both'` — las categorías son explícitamente uno u otro.

### Comportamiento del toggle

- **Tab Comida activo**: se muestran categorías `comida` y `empty`.
- **Tab Bebidas activo**: se muestran categorías `bebida`.

Cambiar de tab hace scroll al top y resetea la categoría activa en la nav.

### Visibilidad del toggle

El toggle **no aparece** si:
- La empresa no es de tipo `restaurante`.
- Ninguna categoría tiene `tipo_producto = 'bebida'`.

---

## Subcategorías vacías

Las subcategorías sin productos no se renderizan en el menú (`menu-section.tsx`):
```tsx
category.subcategories.filter(s => s.products.length > 0).map(...)
```

---

## Admin — Panel de Categorías

El formulario de categoría incluye un selector Cocina / Bar (radio buttons con íconos):
- **Cocina** (`UtensilsCrossed`) → `tipo_producto = 'comida'`
- **Bar** (`GlassWater`) → `tipo_producto = 'bebida'`

La tabla de categorías muestra un badge coloreado con el tipo de cada categoría.

## Admin — Panel de Productos

Para empresas `restaurante`, la tabla de productos incluye una columna **Tipo** que muestra el tipo derivado de la categoría del producto (badge Cocina/Bar). El formulario de producto ya no incluye el checkbox "Bebida" — el tipo se controla desde la categoría.

---

## Flujo recomendado

1. En `/admin/categorias`, crear categorías para bebidas (ej: "Cervezas", "Vinos", "Refrescos") y seleccionar **Bar**.
2. Asignar productos a esas categorías — heredan el tipo automáticamente.
3. El toggle Comida/Bebidas aparece en el menú público.

---

## Archivos clave

| Archivo | Rol |
|---|---|
| `supabase/migrations/20260624000002_categorias_tipo_producto.sql` | Añade `tipo_producto` a `categorias` |
| `src/core/domain/entities/types.ts` | `Category.tipoProducto` |
| `src/core/domain/repositories/ICategoryRepository.ts` | `tipo_producto` en CreateCategoryData |
| `src/core/application/dtos/category.dto.ts` | Validación Zod |
| `src/core/infrastructure/database/SupabaseCategoryRepository.ts` | Map, insert, cascade a productos |
| `src/core/infrastructure/database/SupabaseProductRepository.ts` | Deriva tipo de categoría en create |
| `src/core/application/dtos/menu-view-model.ts` | `MenuCategoryVM.tipoProducto` |
| `src/core/application/mappers/menu.mapper.ts` | Pasa `tipoProducto` al VM |
| `src/app/api/admin/categorias/route.ts` | Expone `tipo_producto` al admin |
| `src/app/admin/(protected)/categorias/page.tsx` | Formulario + badge en tabla |
| `src/app/admin/(protected)/productos/page.tsx` | Columna Tipo (solo restaurante) |
| `src/components/client-menu-page.tsx` | `getCategoryTab`, `showTabs`, `visibleCategories` |
| `src/components/menu-section.tsx` | Filtra subcategorías vacías |
