/**
 * sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), R-M2b.3/DD9:
 * `gestionarAvisosUseCase` resuelve las tres acciones sobre un token de
 * gestión — `consultar` (M2b8b, no muta, sin auditoría), `confirmar` y
 * `baja` (R-M2b.3.5, auditan SIEMPRE sin email ni token en el payload,
 * `actorTipo: 'system'` porque no hay sesión).
 */
import { describe, expect, it, vi } from 'vitest';
import { gestionarAvisosUseCase } from '@/core/application/use-cases/kits/gestionarAvisos.use-case';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { IAuditLogRepository } from '@/core/domain/repositories/IAuditLogRepository';

const EMPRESA_ID = 'empresa-1';
const TOKEN_VALIDO = 'a'.repeat(43);
const PENDIENTE_CADUCA_ANTES_DE = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

function fakeRepo(overrides: Partial<IKitAvisosRepository> = {}): IKitAvisosRepository {
  return {
    reservarAlta: vi.fn(),
    findContacto: vi.fn(),
    findPorToken: vi.fn(),
    confirmar: vi.fn(),
    borrar: vi.fn(),
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

describe('gestionarAvisosUseCase', () => {
  it('con un token mal formado, devuelve ok(null) sin consultar el repositorio', async () => {
    const findPorToken = vi.fn();
    const confirmar = vi.fn();
    const borrar = vi.fn();
    const repo = fakeRepo({ findPorToken, confirmar, borrar });
    const auditRepo = fakeAuditRepo();

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, 'token-corto', 'consultar', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: null });
    expect(findPorToken).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
    expect(borrar).not.toHaveBeenCalled();
  });

  it('consultar: devuelve { serie, estado } a partir de findPorToken, sin auditar', async () => {
    const findPorToken = vi.fn().mockResolvedValue({
      success: true,
      data: { serie: 'KEC-ABCD-1234-X', estado: 'pendiente', version: 'kit-avisos-v1' },
    });
    const insert = vi.fn();
    const repo = fakeRepo({ findPorToken });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'consultar', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'pendiente' } });
    expect(findPorToken).toHaveBeenCalledWith(EMPRESA_ID, TOKEN_VALIDO, PENDIENTE_CADUCA_ANTES_DE);
    expect(insert).not.toHaveBeenCalled();
  });

  it('consultar: token desconocido devuelve ok(null) sin auditar', async () => {
    const findPorToken = vi.fn().mockResolvedValue({ success: true, data: null });
    const insert = vi.fn();
    const repo = fakeRepo({ findPorToken });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'consultar', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('confirmar: audita kit.avisos.confirmado con { serie, version }, sin email ni token', async () => {
    const confirmar = vi.fn().mockResolvedValue({
      success: true,
      data: { serie: 'KEC-ABCD-1234-X', estado: 'registrada', version: 'kit-avisos-v1' },
    });
    const insert = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ confirmar });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'confirmar', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'registrada' } });
    expect(confirmar).toHaveBeenCalledWith(EMPRESA_ID, TOKEN_VALIDO, PENDIENTE_CADUCA_ANTES_DE);
    expect(insert).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      action: 'kit.avisos.confirmado',
      payload: { serie: 'KEC-ABCD-1234-X', version: 'kit-avisos-v1' },
      actorId: null,
      actorTipo: 'system',
      actorNombre: null,
    });
    const payloadSerializado = JSON.stringify(insert.mock.calls[0][0]);
    expect(payloadSerializado).not.toContain('@');
    expect(payloadSerializado).not.toContain(TOKEN_VALIDO);
  });

  it('confirmar: con un pendiente ya caducado, devuelve ok(null) sin auditar', async () => {
    const confirmar = vi.fn().mockResolvedValue({ success: true, data: null });
    const insert = vi.fn();
    const repo = fakeRepo({ confirmar });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'confirmar', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('confirmar: propaga un error del repositorio sin auditar', async () => {
    const confirmar = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });
    const insert = vi.fn();
    const repo = fakeRepo({ confirmar });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'confirmar', PENDIENTE_CADUCA_ANTES_DE);

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('baja: audita kit.avisos.baja con { serie }', async () => {
    const borrar = vi.fn().mockResolvedValue({ success: true, data: { serie: 'KEC-ABCD-1234-X' } });
    const insert = vi.fn().mockResolvedValue(undefined);
    const repo = fakeRepo({ borrar });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'baja', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'baja' } });
    expect(borrar).toHaveBeenCalledWith(EMPRESA_ID, TOKEN_VALIDO);
    expect(insert).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      action: 'kit.avisos.baja',
      payload: { serie: 'KEC-ABCD-1234-X' },
      actorId: null,
      actorTipo: 'system',
      actorNombre: null,
    });
  });

  it('baja: token desconocido devuelve ok(null) sin auditar', async () => {
    const borrar = vi.fn().mockResolvedValue({ success: true, data: null });
    const insert = vi.fn();
    const repo = fakeRepo({ borrar });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'baja', PENDIENTE_CADUCA_ANTES_DE);

    expect(result).toEqual({ success: true, data: null });
    expect(insert).not.toHaveBeenCalled();
  });

  it('baja: propaga un error del repositorio sin auditar', async () => {
    const borrar = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });
    const insert = vi.fn();
    const repo = fakeRepo({ borrar });
    const auditRepo = fakeAuditRepo({ insert });

    const result = await gestionarAvisosUseCase(repo, auditRepo, EMPRESA_ID, TOKEN_VALIDO, 'baja', PENDIENTE_CADUCA_ANTES_DE);

    expect(result.success).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
