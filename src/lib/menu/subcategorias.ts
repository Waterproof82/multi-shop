import type { MenuCategoryVM, MenuSubcategoryVM } from "@/core/application/dtos/menu-view-model";

/** Subcategorías con al menos un producto activo — las vacías no se pintan. */
export function subcategoriasConProductos(cat: MenuCategoryVM): MenuSubcategoryVM[] {
  return cat.subcategories?.filter((s) => s.products.length > 0) ?? [];
}

/**
 * Si la categoría tiene subcategorías visibles. Decide, en `CategoryNav`, si
 * la pastilla lleva chevron y abre el diálogo en vez de scrollear directo.
 */
export function tieneSubcategoriasConProductos(cat: MenuCategoryVM): boolean {
  return subcategoriasConProductos(cat).length > 0;
}
