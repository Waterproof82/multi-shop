/**
 * SlugHistoricoUseCase — resuelve a qué slug vivo redirigir un slug antiguo
 * (product-detail-pages PR5, tarea 5.4). La regla de negocio ("solo si el
 * producto sigue activo y tiene slug") vive aquí, no en el repositorio, para
 * poder probarla sin tocar Supabase — mismo patrón que product.use-case.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import { SlugHistoricoUseCase } from '@/core/application/use-cases/slug-historico.use-case';
import type { ISlugHistoricoRepository, SlugHistoricoProducto } from '@/core/domain/repositories/ISlugHistoricoRepository';

function repoStub(resultado: SlugHistoricoProducto | null): ISlugHistoricoRepository {
  return {
    buscarProductoPorSlugAntiguo: vi.fn().mockResolvedValue({ success: true, data: resultado }),
  };
}

describe('SlugHistoricoUseCase.resolverSlugActual', () => {
  it('sin histórico para este tenant: no redirige', async () => {
    const useCase = new SlugHistoricoUseCase(repoStub(null));

    const result = await useCase.resolverSlugActual('empresa-1', 'kit-basico-viejo');

    expect(result).toEqual({ success: true, data: null });
  });

  it('histórico existe pero el producto ya no está activo: no redirige (evita un segundo 404)', async () => {
    const useCase = new SlugHistoricoUseCase(
      repoStub({ productoId: 'p1', slugActual: 'kit-basico-24h', activo: false })
    );

    const result = await useCase.resolverSlugActual('empresa-1', 'kit-basico-viejo');

    expect(result).toEqual({ success: true, data: null });
  });

  it('histórico existe pero el producto activo se quedó sin slug: no redirige', async () => {
    const useCase = new SlugHistoricoUseCase(
      repoStub({ productoId: 'p1', slugActual: null, activo: true })
    );

    const result = await useCase.resolverSlugActual('empresa-1', 'kit-basico-viejo');

    expect(result).toEqual({ success: true, data: null });
  });

  it('producto activo con slug vivo: devuelve el slug ACTUAL para redirigir', async () => {
    const repo = repoStub({ productoId: 'p1', slugActual: 'kit-basico-24h', activo: true });
    const useCase = new SlugHistoricoUseCase(repo);

    const result = await useCase.resolverSlugActual('empresa-1', 'kit-basico-viejo');

    expect(result).toEqual({ success: true, data: 'kit-basico-24h' });
    expect(repo.buscarProductoPorSlugAntiguo).toHaveBeenCalledWith('empresa-1', 'kit-basico-viejo');
  });

  it('propaga el error del repositorio sin envolverlo en null', async () => {
    const repo: ISlugHistoricoRepository = {
      buscarProductoPorSlugAntiguo: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'DB_ERROR', message: 'fallo', module: 'repository', method: 'buscarProductoPorSlugAntiguo' },
      }),
    };
    const useCase = new SlugHistoricoUseCase(repo);

    const result = await useCase.resolverSlugActual('empresa-1', 'kit-basico-viejo');

    expect(result.success).toBe(false);
  });
});
