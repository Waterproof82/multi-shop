import { describe, expect, it, vi } from 'vitest';
import { verContactoKitUseCase } from '@/core/application/use-cases/kits/verContactoKit.use-case';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';
import type { ContactoKit } from '@/core/domain/entities/kit-caducidad-types';

// sdd kit-expiry-reminders M4d (docs/sdd/kit-expiry-reminders/m4/), R-M4.5.2/
// R-M4.5.3, DD12 de design.md: único caso de uso que devuelve el email/
// telefono completos, y registra SIEMPRE la auditoría del acceso — nunca con
// el email/telefono en el payload, solo la serie.

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

function fakeAuditRepo(overrides: Partial<IAuditLogRepository> = {}): IAuditLogRepository {
  return {
    insert: vi.fn().mockResolvedValue(undefined),
    findByEmpresa: vi.fn(),
    ...overrides,
  };
}

const contactoEjemplo: ContactoKit = {
  serie: 'KEC-ABCD-1234-X',
  email: 'maria@example.com',
  telefono: '+34600123456',
};

const actor = { actorId: 'admin-1', actorTipo: 'admin' as const, actorNombre: 'Admin' };

describe('verContactoKitUseCase', () => {
  it('revela el contacto completo y audita SOLO la serie (R-M4.5.3)', async () => {
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: contactoEjemplo });
    const insert = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ findContacto });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await verContactoKitUseCase(repo, auditRepo, 'empresa-1', 'KEC-ABCD-1234-X', actor);

    expect(result).toEqual({ success: true, data: contactoEjemplo });
    expect(insert).toHaveBeenCalledWith({
      empresaId: 'empresa-1',
      action: 'admin.kits.ver_contacto',
      payload: { serie: 'KEC-ABCD-1234-X' },
      ...actor,
    });
    const payloadSerializado = JSON.stringify(insert.mock.calls[0][0]);
    expect(payloadSerializado).not.toContain('maria@example.com');
    expect(payloadSerializado).not.toContain('+34600123456');
  });

  it('devuelve KIT_SERIE_NOT_FOUND sin auditar cuando la serie no existe', async () => {
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: null });
    const insert = vi.fn();
    const repo = fakeRepo({ findContacto });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await verContactoKitUseCase(repo, auditRepo, 'empresa-1', 'KEC-NOPE-0000-Z', actor);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_SERIE_NOT_FOUND');
    expect(insert).not.toHaveBeenCalled();
  });

  it('propaga un error del repositorio sin auditar', async () => {
    const findContacto = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });
    const insert = vi.fn();
    const repo = fakeRepo({ findContacto });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await verContactoKitUseCase(repo, auditRepo, 'empresa-1', 'KEC-ABCD-1234-X', actor);

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
