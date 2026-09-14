import { describe, it, expect, vi } from 'vitest';
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';

describe('Catálogo público de modalidades — solo activas', () => {
  it('getActivasPublicas delega en findActivasPublicas (no findAllByTenant) y devuelve el resultado', async () => {
    const modalidadEjemplo = {
      id: 'm1', empresaId: 'e1', tipo: 'domicilio' as const, icono: 'bike',
      nombre: 'Envío', precioCents: 350, tiempoMinMinutos: 120, tiempoMaxMinutos: 180,
      activo: true, orden: 0,
    };
    const repo: IModalidadEntregaRepository = {
      findAllByTenant: vi.fn(),
      findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: [modalidadEjemplo] }),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.getActivasPublicas('e1');

    expect(repo.findActivasPublicas).toHaveBeenCalledWith('e1');
    expect(repo.findAllByTenant).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: [modalidadEjemplo] });
  });
});
