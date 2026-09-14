import { describe, it, expect, vi } from 'vitest';
import { ModalidadEntregaUseCase } from '@/core/application/use-cases/modalidad-entrega.use-case';
import type { IModalidadEntregaRepository } from '@/core/domain/repositories/IModalidadEntregaRepository';
import type { ModalidadEntrega } from '@/core/domain/entities/types';

const modalidadEjemplo: ModalidadEntrega = {
  id: 'm1', empresaId: 'e1', tipo: 'domicilio', icono: 'bike',
  nombre: 'Envío estándar', precioCents: 350,
  tiempoMinMinutos: 120, tiempoMaxMinutos: 180, activo: true, orden: 0,
};

function repoMock(overrides: Partial<IModalidadEntregaRepository> = {}): IModalidadEntregaRepository {
  return {
    findAllByTenant: vi.fn().mockResolvedValue({ success: true, data: [modalidadEjemplo] }),
    findActivasPublicas: vi.fn().mockResolvedValue({ success: true, data: [modalidadEjemplo] }),
    findById: vi.fn().mockResolvedValue({ success: true, data: modalidadEjemplo }),
    create: vi.fn().mockResolvedValue({ success: true, data: modalidadEjemplo }),
    update: vi.fn().mockResolvedValue({ success: true, data: modalidadEjemplo }),
    delete: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    ...overrides,
  };
}

describe('ModalidadEntregaUseCase', () => {
  it('getAll delega al repositorio y propaga el resultado', async () => {
    const repo = repoMock();
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.getAll('e1');
    expect(result).toEqual({ success: true, data: [modalidadEjemplo] });
  });

  it('validarPrecioVigente devuelve el precio actual cuando la modalidad existe, es de la empresa y está activa', async () => {
    const repo = repoMock();
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.validarPrecioVigente('m1', 'e1');
    expect(result).toEqual({ success: true, data: { precioCents: 350, tipo: 'domicilio' } });
  });

  it('validarPrecioVigente falla si la modalidad no existe', async () => {
    const repo = repoMock({ findById: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.validarPrecioVigente('inexistente', 'e1');
    expect(result.success).toBe(false);
  });

  it('validarPrecioVigente falla si la modalidad está inactiva', async () => {
    const repo = repoMock({
      findById: vi.fn().mockResolvedValue({ success: true, data: { ...modalidadEjemplo, activo: false } }),
    });
    const useCase = new ModalidadEntregaUseCase(repo);
    const result = await useCase.validarPrecioVigente('m1', 'e1');
    expect(result.success).toBe(false);
  });
});
