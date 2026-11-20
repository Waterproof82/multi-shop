import { describe, expect, it, vi } from 'vitest';
import { borrarDatosChapaUseCase } from '@/core/application/use-cases/mascotas/borrarDatosChapa.use-case';
import type { IPetChapaAdminRepository } from '@/core/domain/repositories/IPetChapaAdminRepository';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';

// sdd pet-id-qr-profile, Fase 6 (R-QR.1.3) — escenario «borrado auditado»:
// delega en `repo.borrarDatos`, y SOLO si borró algo registra la auditoría
// con `{ codigo }`, nunca con email/teléfono/nombre/token/foto (calco de
// `verContactoKit.use-case.test.ts`).

const CODIGO = 'M-AAAA-1111-X';
const EMPRESA_ID = 'empresa-1';

const actor = { actorId: 'admin-1', actorTipo: 'admin' as const, actorNombre: 'Ana' };

function fakeRepo(overrides: Partial<IPetChapaAdminRepository> = {}): IPetChapaAdminRepository {
  return {
    createLote: vi.fn(),
    findLoteById: vi.fn(),
    findLotes: vi.fn(),
    insertCodigosIgnorandoDuplicados: vi.fn(),
    countPorEstado: vi.fn(),
    borrarDatos: vi.fn().mockResolvedValue({ success: true, data: { codigo: CODIGO } }),
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

describe('borrarDatosChapaUseCase', () => {
  it('borra los datos y audita con { codigo }, nunca con un dato personal', async () => {
    const repo = fakeRepo();
    const auditRepo = fakeAuditRepo();

    const result = await borrarDatosChapaUseCase(repo, auditRepo, EMPRESA_ID, CODIGO, actor);

    expect(result).toEqual({ success: true, data: { codigo: CODIGO } });
    expect(repo.borrarDatos).toHaveBeenCalledWith(EMPRESA_ID, CODIGO);
    expect(auditRepo.insert).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      action: 'admin.mascotas.borrar_datos',
      payload: { codigo: CODIGO },
      ...actor,
    });
    // El `payload` es lo que R-QR.1.3 exige «sin PII»: solo el código, nunca
    // el email/teléfono/nombre de la mascota/foto/token del dueño. El resto
    // del registro (actorId/actorNombre) identifica al admin que borró, no
    // a la mascota ni a su dueño, y queda fuera de esta aserción a propósito.
    const { payload } = (auditRepo.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload).toEqual({ codigo: CODIGO });
    expect(JSON.stringify(payload)).not.toMatch(/email|telefono|nombre|foto|token/i);
  });

  it('código ya libre o inexistente devuelve PET_CHAPA_NOT_FOUND sin auditar', async () => {
    const repo = fakeRepo({ borrarDatos: vi.fn().mockResolvedValue({ success: true, data: null }) });
    const auditRepo = fakeAuditRepo();

    const result = await borrarDatosChapaUseCase(repo, auditRepo, EMPRESA_ID, CODIGO, actor);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_CHAPA_NOT_FOUND');
    expect(auditRepo.insert).not.toHaveBeenCalled();
  });

  it('propaga el error del repositorio sin auditar', async () => {
    const repo = fakeRepo({
      borrarDatos: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'caído', module: 'repository' } }),
    });
    const auditRepo = fakeAuditRepo();

    const result = await borrarDatosChapaUseCase(repo, auditRepo, EMPRESA_ID, CODIGO, actor);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
    expect(auditRepo.insert).not.toHaveBeenCalled();
  });
});
