import { describe, expect, it, vi } from 'vitest';
import { crearLoteChapasUseCase } from '@/core/application/use-cases/mascotas/crearLoteChapas.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { PetChapaLote } from '@/core/domain/entities/pet-chapa-types';

// sdd pet-id-qr-profile, Fase 5 (R-QR.1.1): valida la forma del DTO y delega
// en el repositorio; el trigger de la BD es quien comprueba que el producto
// es de esta empresa (calco de `createKitLote.use-case.test.ts`, sin el
// chequeo de "es un kit" porque aquí no aplica el dominio de consumibles).

function fakeRepo(overrides: Partial<IPetChapaAdminRepository> = {}): IPetChapaAdminRepository {
  return {
    createLote: vi.fn(),
    findLoteById: vi.fn(),
    findLotes: vi.fn(),
    findCodigosDeLote: vi.fn(),
    insertCodigosIgnorandoDuplicados: vi.fn(),
    borrarDatos: vi.fn(),
    countPorEstado: vi.fn(),
    ...overrides,
  };
}

const PRODUCTO_ID = '11111111-1111-4111-8111-111111111111';

const loteEjemplo: PetChapaLote = {
  id: 'lote-1',
  empresaId: 'empresa-1',
  productoId: PRODUCTO_ID,
  codigo: 'L01',
  createdAt: '2026-11-20T00:00:00Z',
};

describe('crearLoteChapasUseCase', () => {
  it('con un DTO válido, delega en repo.createLote', async () => {
    const createLote = vi.fn().mockResolvedValue({ success: true, data: loteEjemplo });
    const repo = fakeRepo({ createLote });

    const result = await crearLoteChapasUseCase(repo, 'empresa-1', { productoId: PRODUCTO_ID, codigo: 'L01' });

    expect(result).toEqual({ success: true, data: loteEjemplo });
    expect(createLote).toHaveBeenCalledWith('empresa-1', { productoId: PRODUCTO_ID, codigo: 'L01' });
  });

  it('rechaza un productoId que no es un uuid sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await crearLoteChapasUseCase(repo, 'empresa-1', { productoId: 'no-es-uuid', codigo: 'L01' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.createLote).not.toHaveBeenCalled();
  });

  it('rechaza un código vacío sin llamar al repositorio', async () => {
    const repo = fakeRepo();
    const result = await crearLoteChapasUseCase(repo, 'empresa-1', { productoId: PRODUCTO_ID, codigo: '' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(repo.createLote).not.toHaveBeenCalled();
  });

  it('propaga el error del repositorio (p. ej. VALIDATION_ERROR del trigger)', async () => {
    const createLote = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'El producto no es de esta empresa', module: 'repository' },
    });
    const repo = fakeRepo({ createLote });

    const result = await crearLoteChapasUseCase(repo, 'empresa-1', { productoId: PRODUCTO_ID, codigo: 'L01' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(createLote).toHaveBeenCalledWith('empresa-1', { productoId: PRODUCTO_ID, codigo: 'L01' });
  });
});
