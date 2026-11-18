import { describe, expect, it, vi } from 'vitest';
import { listKitsRegistradosUseCase } from '@/core/application/use-cases/kits/listKitsRegistrados.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { KitRegistradoListado } from '@/core/domain/entities/kit-caducidad-types';

// sdd kit-expiry-reminders M4d (docs/sdd/kit-expiry-reminders/m4/), R-M4.5:
// paginación real (sin tope de 1000) + email/telefono siempre enmascarados,
// nunca el valor completo (eso solo lo da verContactoKitUseCase).

function fakeRepo(overrides: Partial<IKitCaducidadRepository> = {}): IKitCaducidadRepository {
  return {
    findProductosKit: vi.fn(),
    findConsumiblesDelKit: vi.fn(),
    createLote: vi.fn(),
    findLotes: vi.fn(),
    findLoteById: vi.fn(),
    findCaducidades: vi.fn(),
    replaceCaducidades: vi.fn(),
    findLineasCandidatas: vi.fn(),
    findPartesUsadas: vi.fn(),
    insertSeriesIgnorandoDuplicados: vi.fn(),
    findSeriesDeLote: vi.fn(),
    findRegistrados: vi.fn(),
    findContacto: vi.fn(),
    ...overrides,
  };
}

const registradoEjemplo: KitRegistradoListado = {
  serie: 'KEC-ABCD-1234-X',
  loteId: 'lote-1',
  pedidoId: null,
  emailMasked: 'm***a@example.com',
  telefonoMasked: '**********56',
  registradoAt: '2026-11-18T00:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('listKitsRegistradosUseCase', () => {
  it('delega en el repositorio con los defaults de paginación', async () => {
    const findRegistrados = vi.fn().mockResolvedValue({
      success: true,
      data: { items: [registradoEjemplo], total: 1, page: 1, pageSize: 50 },
    });
    const repo = fakeRepo({ findRegistrados });

    const result = await listKitsRegistradosUseCase(repo, 'empresa-1', {});

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toEqual([registradoEjemplo]);
    expect(findRegistrados).toHaveBeenCalledWith('empresa-1', { page: 1, pageSize: 50 });
  });

  it('rechaza una página fuera de rango sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await listKitsRegistradosUseCase(repo, 'empresa-1', { page: 0 });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.findRegistrados).not.toHaveBeenCalled();
  });

  it('nunca expone el email/telefono completos en el resultado (R-M4.5.3)', async () => {
    const findRegistrados = vi.fn().mockResolvedValue({
      success: true,
      data: { items: [registradoEjemplo], total: 1, page: 1, pageSize: 50 },
    });
    const repo = fakeRepo({ findRegistrados });

    const result = await listKitsRegistradosUseCase(repo, 'empresa-1', {});

    expect(result.success).toBe(true);
    if (result.success) {
      const serializado = JSON.stringify(result.data);
      expect(serializado).not.toContain('maria@example.com');
      expect(serializado).not.toContain('+34600123456');
    }
  });
});
