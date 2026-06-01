# Documentación: Toggle Comida/Bebidas en el Menú

## Resumen

Para empresas de tipo `restaurante`, el menú público muestra un toggle que permite al cliente filtrar las categorías por tipo de producto: **Comida** o **Bebidas**. El toggle solo aparece si la empresa tiene al menos un producto con `tipo_producto = 'bebida'`.

---

## Cómo funciona

### Clasificación de categorías

Cada categoría se clasifica automáticamente según los `tipo_producto` de sus ítems:

| Tipo de categoría | Criterio |
|---|---|
| `comida` | Todos sus ítems son comida (o sin tipo asignado) |
| `bebida` | Todos sus ítems son bebidas |
| `both` | Mezcla de comida y bebidas |
| `empty` | Sin ítems |

### Comportamiento del toggle

- **Tab Comida activo**: se muestran categorías `comida`, `both` y `empty`. El botón visible es "Bebidas" (para cambiar).
- **Tab Bebidas activo**: se muestran categorías `bebida` y `both`. El botón visible es "Comida" (para volver).

Cambiar de tab hace scroll al top de la página y resetea la categoría activa en la nav.

### Visibilidad del toggle

El toggle **no aparece** en estos casos:
- La empresa no es de tipo `restaurante`.
- Ningún producto tiene `tipo_producto = 'bebida'` (todos son comida por defecto).

---

## Configuración

### Requisito: productos con categoría asignada

Un producto con `tipo_producto = 'bebida'` pero **sin categoría asignada** no aparece en el menú ni activa el toggle. Todos los productos deben tener una categoría.

### Flujo recomendado en el admin

1. Crear una o más categorías para bebidas (ej: "Bebidas", "Cervezas", "Vinos").
2. Asignar esas categorías a los productos de bebida.
3. En el formulario de cada producto, seleccionar `tipo_producto = bebida`.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/core/application/dtos/menu-view-model.ts` | Añadido campo `tipoProducto?: 'comida' \| 'bebida'` a `MenuItemVM` |
| `src/core/application/mappers/menu.mapper.ts` | `mapProductToItem` ahora mapea `product.tipoProducto` |
| `src/components/category-nav.tsx` | Props `showTabs`, `tab`, `onTabChange`; renderiza el botón del tab inactivo |
| `src/components/client-menu-page.tsx` | Estado `menuTab`, `visibleCategories`, `handleTabChange`; función `getCategoryTab` |
| `src/lib/translations.ts` | Claves `filterFood` / `filterDrinks` en `es` y `en` |

---

## Cambios relacionados en esta rama

### Modo camarero en el menú público

Cuando hay un `waiter_token` activo (cookie) **y** una mesa seleccionada (sessionStorage), el menú público reemplaza el header + HeroBanner por un input de búsqueda de productos. Esto replica exactamente la condición del `WaiterBanner`.

- `src/app/page.tsx`: detecta `waiter_token` y pasa `isWaiterMode` a `MenuPage`.
- `src/components/client-menu-page.tsx`: hook `useEffect` lee `getWaiterMesa()` en el cliente para confirmar que hay mesa activa antes de mostrar el buscador.

### WaiterBanner

Se oculta automáticamente en rutas `/waiter/tables/*` porque el panel de mesas tiene su propia navegación.

### WaiterTableDetail

Rediseño completo del panel de detalle de mesa (`/waiter/tables/[mesaId]`):

- **Mesa cerrada**: botón de abrir mesa.
- **Mesa abierta**: buscador inline que carga los productos automáticamente, lista filtrada con controles de cantidad, resumen de carrito con botón de confirmar pedido, listado de pedidos de la sesión, y acciones de volver/cerrar mesa en el pie.
- Eliminado: modal de selección de productos (reemplazado por búsqueda inline).
