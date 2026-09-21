import type { Product, Category, MenuVirtual } from "@/core/domain/entities/types";
import type { MenuItemVM, MenuSubcategoryVM, MenuCategoryVM, ComplementVM, ComplementGroupVM } from "@/core/application/dtos/menu-view-model";
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';

type TranslationMap = MenuItemVM["translations"];
type DescriptionTranslationMap = MenuCategoryVM["descripcionTranslations"];

function mapCategoryTranslations(cat: Category): TranslationMap {
  return {
    en: cat.translations?.en ? { name: cat.translations.en, description: cat.descripcionTranslations?.en || undefined } : undefined,
    fr: cat.translations?.fr ? { name: cat.translations.fr, description: cat.descripcionTranslations?.fr || undefined } : undefined,
    it: cat.translations?.it ? { name: cat.translations.it, description: cat.descripcionTranslations?.it || undefined } : undefined,
    de: cat.translations?.de ? { name: cat.translations.de, description: cat.descripcionTranslations?.de || undefined } : undefined,
  };
}

function mapDescriptionTranslations(cat: Category): DescriptionTranslationMap {
  return {
    en: cat.descripcionTranslations?.en || undefined,
    fr: cat.descripcionTranslations?.fr || undefined,
    it: cat.descripcionTranslations?.it || undefined,
    de: cat.descripcionTranslations?.de || undefined,
  };
}

function mapProductTranslations(p: Product): TranslationMap {
  return {
    en: p.titulo_en ? { name: p.titulo_en, description: p.descripcion_en || undefined } : undefined,
    fr: p.titulo_fr ? { name: p.titulo_fr, description: p.descripcion_fr || undefined } : undefined,
    it: p.titulo_it ? { name: p.titulo_it, description: p.descripcion_it || undefined } : undefined,
    de: p.titulo_de ? { name: p.titulo_de, description: p.descripcion_de || undefined } : undefined,
  };
}

function mapNameOnlyTranslations(t?: { en?: string; fr?: string; it?: string; de?: string }): TranslationMap {
  if (!t) return {};
  return {
    en: t.en ? { name: t.en } : undefined,
    fr: t.fr ? { name: t.fr } : undefined,
    it: t.it ? { name: t.it } : undefined,
    de: t.de ? { name: t.de } : undefined,
  };
}

function mapComplementProduct(c: Product): ComplementVM {
  return {
    id: c.id,
    name: c.titulo_es,
    price: c.precio,
    description: c.descripcion_es || undefined,
    translations: mapProductTranslations(c),
  };
}

function mapProductToItem(product: Product, categoryName: string): MenuItemVM {
  return {
    id: product.id,
    name: product.titulo_es,
    description: product.descripcion_es || undefined,
    price: product.precio,
    category: categoryName.toLowerCase().replaceAll(" ", "-"),
    image: product.fotoUrl || undefined,
    imageFit: product.fotoObjectFit || undefined,
    highlight: product.esEspecial,
    tipoProducto: product.tipoProducto,
    translations: mapProductTranslations(product),
    alergenos: product.alergenos ?? [],
  };
}

export function mapComplementoGrupoToGroupVM(grupo: ComplementoGrupo): ComplementGroupVM {
  return {
    id: grupo.id,
    name: grupo.nombre_es,
    tipo: grupo.tipo,
    obligatorio: grupo.obligatorio,
    translations: {
      en: grupo.nombre_en ?? undefined,
      fr: grupo.nombre_fr ?? undefined,
      it: grupo.nombre_it ?? undefined,
      de: grupo.nombre_de ?? undefined,
    },
    opciones: grupo.opciones.map(o => ({
      id: o.id,
      name: o.nombre_es,
      price: o.precioAdicional,
      translations: {
        en: o.nombre_en ? { name: o.nombre_en } : undefined,
        fr: o.nombre_fr ? { name: o.nombre_fr } : undefined,
        it: o.nombre_it ? { name: o.nombre_it } : undefined,
        de: o.nombre_de ? { name: o.nombre_de } : undefined,
      },
    })),
  };
}

export class MenuMapper {
  static toSubcategoryVM(
    subCat: Category,
    products: Product[],
  ): MenuSubcategoryVM {
    const subProducts = products.filter((p) => p.categoriaId === subCat.id && p.activo);
    return {
      id: subCat.id,
      nombre: subCat.nombre,
      descripcion: subCat.descripcion || undefined,
      translations: mapCategoryTranslations(subCat),
      descripcionTranslations: mapDescriptionTranslations(subCat),
      products: subProducts.map((p) => mapProductToItem(p, subCat.nombre || "uncategorized")),
    };
  }

  static toCategoryVM(
    parentCat: Category,
    allProducts: Product[],
    childSubcategories: Category[],
    categoryComplements: Product[],
    requiresComplement: boolean,
    categoriesById: Map<string, Category>,
    products: Product[],
    complementCategoryName?: string,
    complementCategoryTranslations?: Category['translations'],
    complementoGruposByProductId?: Map<string, ComplementoGrupo[]>,
  ): MenuCategoryVM {
    const parentProducts = allProducts.filter((p) => p.categoriaId === parentCat.id && p.activo);
    const subcategoryProducts = childSubcategories.flatMap((subCat) =>
      allProducts.filter((p) => p.categoriaId === subCat.id && p.activo)
    );
    const combinedProducts = [...parentProducts, ...subcategoryProducts];

    return {
      id: `category-${parentCat.id}`,
      label: parentCat.nombre ?? "Unnamed Category",
      descripcion: parentCat.descripcion || undefined,
      tipoProducto: parentCat.tipoProducto,
      translations: mapCategoryTranslations(parentCat),
      descripcionTranslations: mapDescriptionTranslations(parentCat),
      complementCategoryName: complementCategoryName || undefined,
      complementCategoryTranslations: complementCategoryTranslations ? {
        en: complementCategoryTranslations.en || undefined,
        fr: complementCategoryTranslations.fr || undefined,
        it: complementCategoryTranslations.it || undefined,
        de: complementCategoryTranslations.de || undefined,
      } : undefined,
      subcategories: childSubcategories.length > 0
        ? childSubcategories.map((subCat) => MenuMapper.toSubcategoryVM(subCat, products))
        : undefined,
      items: combinedProducts.map((p) => {
        const productCategory = p.categoriaId ? categoriesById.get(p.categoriaId) : undefined;
        const categoryName = productCategory?.nombre ?? parentCat.nombre ?? "uncategorized";
        const item = mapProductToItem(p, categoryName);

        return {
          ...item,
          complements: categoryComplements.length > 0
            ? categoryComplements.map(mapComplementProduct)
            : undefined,
          requiresComplement: requiresComplement || undefined,
          complementGroups: complementoGruposByProductId?.get(p.id)?.map(mapComplementoGrupoToGroupVM),
        };
      }),
    };
  }

  static toVirtualSubcategoryVM(
    nodo: MenuVirtual,
    productoIds: string[],
    productosPorId: Map<string, Product>,
    categoriasPorId: Map<string, Category>,
    complementoGruposByProductId?: Map<string, ComplementGroupVM[]>,
  ): MenuSubcategoryVM {
    const productos = productoIds
      .map((id) => productosPorId.get(id))
      .filter((p): p is Product => p !== undefined && p.activo)
      .map((p) => {
        const categoriaReal = p.categoriaId ? categoriasPorId.get(p.categoriaId) : undefined;
        const item = mapProductToItem(p, categoriaReal?.nombre ?? "uncategorized");
        return {
          ...item,
          complementGroups: complementoGruposByProductId?.get(p.id),
        };
      });

    return {
      id: nodo.id,
      nombre: nodo.nombre,
      translations: mapNameOnlyTranslations(nodo.translations),
      products: productos,
    };
  }

  static toVirtualCategoryVM(
    padre: MenuVirtual,
    hijos: MenuVirtual[],
    asignacionesPorNodo: Map<string, string[]>,
    productosPorId: Map<string, Product>,
    categoriasPorId: Map<string, Category>,
    complementoGruposByProductId?: Map<string, ComplementGroupVM[]>,
  ): MenuCategoryVM {
    const subcategories = hijos.map((hijo) =>
      MenuMapper.toVirtualSubcategoryVM(hijo, asignacionesPorNodo.get(hijo.id) ?? [], productosPorId, categoriasPorId, complementoGruposByProductId)
    );

    // items = unión de todos los hijos, con duplicados posibles si un producto
    // está en más de una hoja — mismo criterio que combinedProducts en
    // toCategoryVM. Necesario porque el filtro final de GetMenuUseCase.execute
    // solo mira `items.length`, no `subcategories`.
    const items = subcategories.flatMap((s) => s.products);

    // Igual que las categorías reales: si TODOS los items son bebida, el menú
    // virtual cuenta como bebida para el split de pestañas del restaurante
    // (getCategoryTab en client-menu-page.tsx). Mixto o vacío → undefined, que
    // ya cae en "comida" por el fallback `cat.tipoProducto ?? 'comida'` existente.
    const tipoProducto = items.length > 0 && items.every((item) => item.tipoProducto === 'bebida')
      ? 'bebida' as const
      : undefined;

    return {
      id: padre.id,
      label: padre.nombre,
      tipoProducto,
      translations: mapNameOnlyTranslations(padre.translations),
      subcategories: subcategories.length > 0 ? subcategories : undefined,
      items,
    };
  }
}
