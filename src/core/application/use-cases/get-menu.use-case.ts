import type { IProductRepository } from "@/core/domain/repositories/IProductRepository";
import type { ICategoryRepository } from "@/core/domain/repositories/ICategoryRepository";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";
import type { Category, Product } from "@/core/domain/entities/types";
import { MenuMapper } from "@/core/application/mappers/menu.mapper";
import { logger } from "@/core/infrastructure/logging/logger";

export class GetMenuUseCase {
  constructor(
    private readonly productRepo: IProductRepository,
    private readonly categoryRepo: ICategoryRepository
  ) {}

  async execute(empresaId: string): Promise<{ data?: MenuCategoryVM[]; error?: string }> {
    try {
      const [productsResult, categoriesResult] = await Promise.all([
        this.productRepo.findAllByTenant(empresaId),
        this.categoryRepo.findAllByTenant(empresaId),
      ]);

      // Handle product errors
      if (!productsResult.success) {
        await logger.logAndReturnError(
          'USE_CASE_ERROR',
          productsResult.error.message,
          'use-case',
          'GetMenuUseCase.execute',
          { empresaId, details: { code: productsResult.error.code, method: 'productRepo.findAllByTenant' } }
        );
        return { error: productsResult.error.message };
      }

      // Handle category errors
      if (!categoriesResult.success) {
        await logger.logAndReturnError(
          'USE_CASE_ERROR',
          categoriesResult.error.message,
          'use-case',
          'GetMenuUseCase.execute',
          { empresaId, details: { code: categoriesResult.error.code, method: 'categoryRepo.findAllByTenant' } }
        );
        return { error: categoriesResult.error.message };
      }

      const products = productsResult.data;
      const categories = categoriesResult.data;

      const mainCategories = categories.filter((cat) => !cat.categoriaComplementoDe);
      const complementCategories = categories.filter((cat) => cat.categoriaComplementoDe);

      // Mapa de complementos por categoría padre
      const complementsByCategoryId = new Map<string, Product[]>();
      for (const compCat of complementCategories) {
        const parentId = compCat.categoriaComplementoDe!;
        const compProducts = products.filter((p) => p.categoriaId === compCat.id && p.activo);
        if (!complementsByCategoryId.has(parentId)) {
          complementsByCategoryId.set(parentId, []);
        }
        complementsByCategoryId.get(parentId)!.push(...compProducts);
      }

      // Mapa de complemento_obligatorio por categoría padre
      const complementoObligatorioMap = new Map<string, boolean>();
      for (const compCat of complementCategories) {
        if (compCat.categoriaComplementoDe) {
          complementoObligatorioMap.set(compCat.categoriaComplementoDe, compCat.complementoObligatorio);
        }
      }

      // Separar categorías padres de subcategorías
      const parentCategories = mainCategories.filter((cat) => !cat.categoriaPadreId);
      const subCategories = mainCategories.filter((cat) => cat.categoriaPadreId);

      parentCategories.sort((a, b) => (a.orden || 0) - (b.orden || 0));
      subCategories.sort((a, b) => (a.orden || 0) - (b.orden || 0));

      // Mapa de subcategorías por padre
      const subcategoriesByParent = new Map<string, Category[]>();
      for (const subCat of subCategories) {
        const parentId = subCat.categoriaPadreId!;
        if (!subcategoriesByParent.has(parentId)) {
          subcategoriesByParent.set(parentId, []);
        }
        subcategoriesByParent.get(parentId)!.push(subCat);
      }

      // Mapa de todas las categorías por ID
      const categoriesById = new Map<string, Category>();
      for (const cat of categories) {
        categoriesById.set(cat.id, cat);
      }

      // Delegar el mapeo al MenuMapper
      const menu: MenuCategoryVM[] = parentCategories.map((parentCat) => {
        const childSubcategories = subcategoriesByParent.get(parentCat.id) || [];
        const categoryComplements = complementsByCategoryId.get(parentCat.id) || [];
        const requiresComplement = complementoObligatorioMap.get(parentCat.id) || false;

        return MenuMapper.toCategoryVM(
          parentCat,
          products,
          childSubcategories,
          categoryComplements,
          requiresComplement,
          categoriesById,
          products,
        );
      });

      return { data: menu.filter((cat) => cat.items.length > 0) };
    } catch (e) {
      const appError = await logger.logFromCatch(e, 'use-case', 'GetMenuUseCase.execute', {
        empresaId,
      });
      return { error: appError.message };
    }
  }
}
