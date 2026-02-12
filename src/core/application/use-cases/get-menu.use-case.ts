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

    // 2. Mapear y agrupar
    const menu: MenuCategoryVM[] = categories.map((cat) => {
      // Filtrar productos de esta categoría
      const catProducts = products.filter((p) => p.categoriaId === cat.id && p.activo);

      return {
        id: cat.nombre.toLowerCase().replaceAll(" ", "-"), // Generamos un slug simple
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
        })),
      };
    });

    // Filtrar categorías vacías si se desea
    return menu.filter((cat) => cat.items.length > 0);
  }
}
