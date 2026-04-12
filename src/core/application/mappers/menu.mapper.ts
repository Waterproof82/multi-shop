import type { Product, Category } from "@/core/domain/entities/types";
import type { MenuItemVM, MenuSubcategoryVM, MenuCategoryVM, ComplementVM } from "@/core/application/dtos/menu-view-model";

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
    translations: mapProductTranslations(product),
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
        };
      }),
    };
  }
}
