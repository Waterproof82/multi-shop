/**
 * GetMenuUseCase.execute — no duplicar el log de un fallo ya logueado.
 *
 * Cuando `productRepo.findAllByTenant` o `categoryRepo.findAllByTenant`
 * fallan, el REPOSITORIO ya loguea el error con su propio código (p. ej.
 * `DB_SELECT_ERROR`) antes de devolver el `Result` fallido — ver
 * `SupabaseProductRepository.findAllByTenant` /
 * `SupabaseCategoryRepository.findAllByTenant`. El use case volvía a
 * loguearlo una segunda vez bajo `USE_CASE_ERROR`: un solo fallo de DB
 * generaba dos eventos en Sentry para el mismo incidente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetMenuUseCase } from '@/core/application/use-cases/get-menu.use-case';
import type { IProductRepository } from '@/core/domain/repositories/IProductRepository';
import type { ICategoryRepository } from '@/core/domain/repositories/ICategoryRepository';
import type { IComplementoGrupoRepository } from '@/core/domain/repositories/IComplementoGrupoRepository';

const { logAndReturnErrorMock } = vi.hoisted(() => ({
  logAndReturnErrorMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: logAndReturnErrorMock, logFromCatch: vi.fn().mockResolvedValue({ message: 'boom' }) },
}));

const dbErrorResult = {
  success: false as const,
  error: { code: 'DB_ERROR', message: 'Error al obtener productos', module: 'repository' as const, method: 'findAllByTenant' },
};

function useCaseConProductRepoFallando(): GetMenuUseCase {
  const productRepo = { findAllByTenant: vi.fn().mockResolvedValue(dbErrorResult) } as unknown as IProductRepository;
  const categoryRepo = { findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [] }) } as unknown as ICategoryRepository;
  const complementoRepo = {} as IComplementoGrupoRepository;
  return new GetMenuUseCase(productRepo, categoryRepo, complementoRepo);
}

beforeEach(() => {
  logAndReturnErrorMock.mockClear();
});

describe('GetMenuUseCase.execute — sin doble log', () => {
  it('cuando el repositorio falla, el use-case NO vuelve a loguear (el repo ya lo hizo)', async () => {
    const useCase = useCaseConProductRepoFallando();

    const resultado = await useCase.execute('empresa-1');

    expect(resultado.error).toBe('Error al obtener productos');
    expect(logAndReturnErrorMock).not.toHaveBeenCalled();
  });
});
