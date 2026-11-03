import type { MenuCategoryVM, MenuItemVM } from "@/core/application/dtos/menu-view-model";

// Lectura pública de productos de tienda sobre la carta ya cacheada
// (`getCachedMenu`), no una consulta nueva (product-detail-pages PR2).
// Puro: el aislamiento por tenant lo garantiza el caller, que ya resolvió
// `getCachedMenu(empresaId)` para UN SOLO tenant — esta función nunca ve ni
// puede ver el menú de otra empresa.

function todosLosItems(menu: MenuCategoryVM[]): MenuItemVM[] {
  return menu.flatMap((categoria) => [
    ...categoria.items,
    ...(categoria.subcategories?.flatMap((sub) => sub.products) ?? []),
  ]);
}

/** Producto por slug dentro del menú ya resuelto para un tenant. */
export function findMenuItemBySlug(menu: MenuCategoryVM[], slug: string): MenuItemVM | undefined {
  return todosLosItems(menu).find((item) => item.slug === slug);
}

/**
 * Productos que deben aparecer en el sitemap y recibir su propia página
 * indexable: necesitan slug y NO tener `canonicalExterno` (ese caso emite
 * `noindex` + canonical externo en su propia página — PR3). Un mismo
 * producto puede estar en varias categorías de la carta, así que se
 * deduplica por slug: una URL, una entrada.
 */
export function productosIndexables(menu: MenuCategoryVM[]): MenuItemVM[] {
  const vistos = new Set<string>();
  return todosLosItems(menu).filter((item) => {
    if (!item.slug || item.canonicalExterno || vistos.has(item.slug)) return false;
    vistos.add(item.slug);
    return true;
  });
}
