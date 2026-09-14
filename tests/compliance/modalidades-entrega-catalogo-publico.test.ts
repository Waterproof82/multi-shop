import { describe, it, expect, vi } from 'vitest';
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';

describe('Catálogo público de modalidades — solo activas', () => {
  it('getActivasPublicas nunca devuelve modalidades con activo=false (lo filtra el repositorio, no el use-case)', async () => {
    const repo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: [] }),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const useCase = new ModalidadEntregaUseCase(repo);
    await useCase.getActivasPublicas('e1');
    expect(repo.findActivasPublicas).toHaveBeenCalledWith('e1');
  });
});
