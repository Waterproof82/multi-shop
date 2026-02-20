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

    // 2. Separar categorías principales de complementos
    const mainCategories = categories.filter((cat) => !cat.categoriaComplementoDe);
    const complementCategories = categories.filter((cat) => cat.categoriaComplementoDe);

    // 3. Crear mapa de categorías complemento por su categoría padre
    const complementsByParent = new Map<string, typeof complementCategories>();
    for (const comp of complementCategories) {
      const parentId = comp.categoriaComplementoDe!;
      if (!complementsByParent.has(parentId)) {
        complementsByParent.set(parentId, []);
      }
      complementsByParent.get(parentId)!.push(comp);
    }

    // 4. Mapear y agrupar - solo categorías principales
    const menu: MenuCategoryVM[] = mainCategories.map((cat) => {
      // Filtrar productos de esta categoría
      const catProducts = products.filter((p) => p.categoriaId === cat.id && p.activo);

      // Obtener productos de categorías complemento
      const complementProds = complementsByParent.get(cat.id) || [];
      const allComplementProducts = complementProds.flatMap((compCat) =>
        products.filter((p) => p.categoriaId === compCat.id && p.activo)
      );

      // Verificar si algún complemento es obligatorio
      const hasRequiredComplement = complementProds.some((compCat) => compCat.complementoObligatorio);

      return {
        id: `category-${cat.id}`, // Use UUID to ensure uniqueness
        label: cat.nombre,
        translations: cat.translations,
        items: catProducts.map((p) => ({
          id: p.id,
          name: p.titulo,
          description: p.descripcion || undefined,
          price: p.precio,
          category: cat.nombre.toLowerCase().replaceAll(" ", "-"),
          image: p.fotoUrl || undefined,
          highlight: p.esEspecial,
          translations: p.translations ? {
            en: p.translations.en ? { name: p.translations.en.titulo, description: p.translations.en.descripcion || undefined } : undefined,
            fr: p.translations.fr ? { name: p.translations.fr.titulo, description: p.translations.fr.descripcion || undefined } : undefined,
            it: p.translations.it ? { name: p.translations.it.titulo, description: p.translations.it.descripcion || undefined } : undefined,
            de: p.translations.de ? { name: p.translations.de.titulo, description: p.translations.de.descripcion || undefined } : undefined,
          } : undefined,
          complements: allComplementProducts.length > 0 ? allComplementProducts.map((p) => ({
            id: p.id,
            name: p.titulo,
            price: p.precio,
            description: p.descripcion || undefined,
          })) : undefined,
          requiresComplement: hasRequiredComplement ? true : undefined,
        })),
      };
    });

    // 5. Filtrar categorías vacías - NO mostrar categorías complemento como secciones separadas
    return menu.filter((cat) => cat.items.length > 0);
  }
}
