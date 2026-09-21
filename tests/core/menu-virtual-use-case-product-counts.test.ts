import { describe, it, expect, vi } from 'vitest';
import { MenuVirtualUseCase } from '../../src/core/application/use-cases/menu-virtual.use-case';
import type { IMenuVirtualRepository } from '../../src/core/domain/repositories/IMenuVirtualRepository';

function repoStubConAsignaciones(asignaciones: { menuVirtualId: string; productoId: string }[]): IMenuVirtualRepository {
  return {
    findAllByTenant: vi.fn(),
    findAsignacionesByTenant: vi.fn().mockResolvedValue({ success: true, data: asignaciones }),
    findProductoIdsByMenuVirtual: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setProductos: vi.fn(),
    addProductos: vi.fn(),
  };
}

describe('MenuVirtualUseCase.getProductCounts', () => {
  it('agrupa las asignaciones por menuVirtualId', async () => {
    const repo = repoStubConAsignaciones([
      { menuVirtualId: 'hoja-1', productoId: 'p1' },
      { menuVirtualId: 'hoja-1', productoId: 'p2' },
      { menuVirtualId: 'hoja-2', productoId: 'p3' },
    ]);
    const useCase = new MenuVirtualUseCase(repo);

    const result = await useCase.getProductCounts('empresa-1');

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.get('hoja-1')).toBe(2);
    expect(result.data.get('hoja-2')).toBe(1);
    expect(result.data.has('hoja-sin-productos')).toBe(false);
  });

  it('propaga el error si el repo falla', async () => {
    const repo = repoStubConAsignaciones([]);
    repo.findAsignacionesByTenant = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository', method: 'findAsignacionesByTenant' },
    });
    const useCase = new MenuVirtualUseCase(repo);

    const result = await useCase.getProductCounts('empresa-1');

    expect(result.success).toBe(false);
  });
});
