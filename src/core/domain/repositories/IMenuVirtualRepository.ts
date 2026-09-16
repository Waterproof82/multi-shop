import type { Result, MenuVirtual } from '@/core/domain/entities/types';

export interface CreateMenuVirtualData {
  empresaId: string;
  padreId?: string | null;
  nombre_es: string;
  nombre_en?: string | null;
  nombre_fr?: string | null;
  nombre_it?: string | null;
  nombre_de?: string | null;
  orden?: number;
}

// padreId no es editable via update — re-parentar requiere borrar y recrear el nodo,
// evita restructurar el arbol por accidente via un PATCH generico.
export interface UpdateMenuVirtualData extends Partial<Omit<CreateMenuVirtualData, 'empresaId' | 'padreId'>> {}

export interface MenuVirtualProductoAsignacion {
  menuVirtualId: string;
  productoId: string;
}

export interface IMenuVirtualRepository {
  findAllByTenant(empresaId: string): Promise<Result<MenuVirtual[]>>;
  findAsignacionesByTenant(empresaId: string): Promise<Result<MenuVirtualProductoAsignacion[]>>;
  findProductoIdsByMenuVirtual(menuVirtualId: string, empresaId: string): Promise<Result<string[]>>;
  create(data: CreateMenuVirtualData): Promise<Result<MenuVirtual>>;
  update(id: string, empresaId: string, data: UpdateMenuVirtualData): Promise<Result<MenuVirtual>>;
  delete(id: string, empresaId: string): Promise<Result<void>>;
  setProductos(menuVirtualId: string, productoIds: string[], empresaId: string): Promise<Result<void>>;
}
