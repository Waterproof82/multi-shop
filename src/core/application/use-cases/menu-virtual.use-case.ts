import type {
  IMenuVirtualRepository,
  CreateMenuVirtualData,
  UpdateMenuVirtualData,
} from '@/core/domain/repositories/IMenuVirtualRepository';
import type { MenuVirtual, Result } from '@/core/domain/entities/types';

export class MenuVirtualUseCase {
  constructor(private readonly repo: IMenuVirtualRepository) {}

  getAll(empresaId: string): Promise<Result<MenuVirtual[]>> {
    return this.repo.findAllByTenant(empresaId);
  }

  getProductoIds(menuVirtualId: string, empresaId: string): Promise<Result<string[]>> {
    return this.repo.findProductoIdsByMenuVirtual(menuVirtualId, empresaId);
  }

  async getProductCounts(empresaId: string): Promise<Result<Map<string, number>>> {
    const result = await this.repo.findAsignacionesByTenant(empresaId);
    if (!result.success) return result;

    const counts = new Map<string, number>();
    for (const asignacion of result.data) {
      counts.set(asignacion.menuVirtualId, (counts.get(asignacion.menuVirtualId) ?? 0) + 1);
    }
    return { success: true, data: counts };
  }

  create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>> {
    return this.repo.create(data);
  }

  update(id: string, empresaId: string, data: UpdateMenuVirtualData): Promise<Result<MenuVirtual>> {
    return this.repo.update(id, empresaId, data);
  }

  delete(id: string, empresaId: string): Promise<Result<void>> {
    return this.repo.delete(id, empresaId);
  }

  setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    return this.repo.setProductos(menuVirtualId, productoIds, empresaId);
  }

  addProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>> {
    return this.repo.addProductos(menuVirtualId, productoIds, empresaId);
  }
}
