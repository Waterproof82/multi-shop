import { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";

export class GetMenuUseCase {
  constructor(
    private productRepo: IProductRepository,
    private categoryRepo: ICategoryRepository
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
        id: cat.nombre.toLowerCase().replace(/ /g, "-"), // Generamos un slug simple
        label: cat.nombre,
        items: catProducts.map((p) => ({
          id: p.id,
          name: p.titulo,
          description: p.descripcion || undefined,
          price: p.precio,
          category: cat.nombre.toLowerCase().replace(/ /g, "-"),
          image: p.fotoUrl || undefined,
          highlight: p.esEspecial,
        })),
      };
    });

    // Filtrar categorías vacías si se desea
    return menu.filter((cat) => cat.items.length > 0);
  }
}
