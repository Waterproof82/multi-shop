import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";

export class GetMenuUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(empresaId: string): Promise<MenuCategoryVM[]> {
    // 1. Ejecutar consultas en paralelo para eficiencia
    const [products, categories] = await Promise.all([
      this.productRepo.findAllByTenant(empresaId),
      this.categoryRepo.findAllByTenant(empresaId),
    ]);

    // 2. Filtrar categorías que no son complemento (excluir categoriaComplementoDe)
    const mainCategories = categories.filter((cat) => !cat.categoriaComplementoDe);

    // 3. Obtener categorías de complementos y crear mapa
    const complementCategories = categories.filter((cat) => cat.categoriaComplementoDe);
    const complementsByCategoryId = new Map<string, typeof products>();
    for (const compCat of complementCategories) {
      const parentId = compCat.categoriaComplementoDe!;
      const compProducts = products.filter((p) => p.categoriaId === compCat.id && p.activo);
      if (!complementsByCategoryId.has(parentId)) {
        complementsByCategoryId.set(parentId, []);
      }
      complementsByCategoryId.get(parentId)!.push(...compProducts);
    }

    // 4. Obtener map de complementoObligatorio por categoría padre
    const complementoObligatorioMap = new Map<string, boolean>();
    for (const compCat of complementCategories) {
      if (compCat.categoriaComplementoDe) {
        complementoObligatorioMap.set(compCat.categoriaComplementoDe, compCat.complementoObligatorio);
      }
    }

    // 5. Separar categorías principales de subcategorías (por categoriaPadreId)
    const parentCategories = mainCategories.filter((cat) => !cat.categoriaPadreId);
    const subCategories = mainCategories.filter((cat) => cat.categoriaPadreId);

    // 6. Crear mapa de subcategorías por su categoría padre
    const subcategoriesByParent = new Map<string, typeof subCategories>();
    for (const subCat of subCategories) {
      const parentId = subCat.categoriaPadreId!;
      if (!subcategoriesByParent.has(parentId)) {
        subcategoriesByParent.set(parentId, []);
      }
      subcategoriesByParent.get(parentId)!.push(subCat);
    }

    // 7. Mapear y agrupar - solo categorías principales (padres)
    const menu: MenuCategoryVM[] = parentCategories.map((parentCat) => {
      // Obtener subcategorías de esta categoría padre
      const childSubcategories = subcategoriesByParent.get(parentCat.id) || [];

      // Productos de la categoría padre (si los hay, aunque normalmente estarán en subcategorías)
      const parentProducts = products.filter((p) => p.categoriaId === parentCat.id && p.activo);

      // Productos de las subcategorías
      const subcategoryProducts = childSubcategories.flatMap((subCat) =>
        products.filter((p) => p.categoriaId === subCat.id && p.activo)
      );

      // Combinar todos los productos
      const allProducts = [...parentProducts, ...subcategoryProducts];

      // Obtener complementos para esta categoría
      const categoryComplements = complementsByCategoryId.get(parentCat.id) || [];
      const requiresComplement = complementoObligatorioMap.get(parentCat.id) || false;

      return {
        id: `category-${parentCat.id}`,
        label: parentCat.nombre,
        descripcion: parentCat.descripcion || undefined,
        translations: parentCat.translations,
        descripcionTranslations: parentCat.descripcionTranslations,
        subcategories: childSubcategories.length > 0 ? childSubcategories.map((subCat) => ({
          id: subCat.id,
          nombre: subCat.nombre,
          descripcion: subCat.descripcion || undefined,
          translations: subCat.translations,
          descripcionTranslations: subCat.descripcionTranslations,
          products: products.filter((p) => p.categoriaId === subCat.id && p.activo).map((p) => ({
            id: p.id,
            name: p.titulo_es,
            description: p.descripcion_es || undefined,
            price: p.precio,
            category: subCat.nombre.toLowerCase().replaceAll(" ", "-"),
            image: p.fotoUrl || undefined,
            highlight: p.esEspecial,
            translations: {
              en: p.titulo_en ? { name: p.titulo_en, description: p.descripcion_en || undefined } : undefined,
              fr: p.titulo_fr ? { name: p.titulo_fr, description: p.descripcion_fr || undefined } : undefined,
              it: p.titulo_it ? { name: p.titulo_it, description: p.descripcion_it || undefined } : undefined,
              de: p.titulo_de ? { name: p.titulo_de, description: p.descripcion_de || undefined } : undefined,
            },
          })),
        })) : undefined,
        items: allProducts.map((p) => ({
          id: p.id,
          name: p.titulo_es,
          description: p.descripcion_es || undefined,
          price: p.precio,
          category: parentCat.nombre.toLowerCase().replaceAll(" ", "-"),
          image: p.fotoUrl || undefined,
          highlight: p.esEspecial,
          translations: {
            en: p.titulo_en ? { name: p.titulo_en, description: p.descripcion_en || undefined } : undefined,
            fr: p.titulo_fr ? { name: p.titulo_fr, description: p.descripcion_fr || undefined } : undefined,
            it: p.titulo_it ? { name: p.titulo_it, description: p.descripcion_it || undefined } : undefined,
            de: p.titulo_de ? { name: p.titulo_de, description: p.descripcion_de || undefined } : undefined,
          },
          complements: categoryComplements.length > 0 ? categoryComplements.map((c) => ({
            id: c.id,
            name: c.titulo_es,
            price: c.precio,
            description: c.descripcion_es || undefined,
          })) : undefined,
          requiresComplement: requiresComplement || undefined,
        })),
      };
    });

    // 8. Filtrar categorías vacías
    return menu.filter((cat) => cat.items.length > 0);
  }
}
