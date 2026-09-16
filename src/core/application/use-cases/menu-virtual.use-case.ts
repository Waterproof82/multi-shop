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
}
