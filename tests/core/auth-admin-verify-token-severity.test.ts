/**
 * AuthAdminUseCase.verifyToken — severidad de un JWT expirado/inválido.
 *
 * Un token expirado o malformado se recibe en CADA request autenticado cuya
 * sesión venció (24h) — es el ciclo de vida normal de una sesión, no un bug.
 * Antes de este fix, el catch de `jwtVerify` lo logueaba con la severidad
 * por defecto ('error'), así que cada expiración se capturaba en Sentry como
 * excepción de aplicación — probablemente el mayor volumen de ruido de la app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthAdminUseCase } from '@/core/application/use-cases/auth-admin.use-case';
import type { IAdminRepository } from '@/core/domain/repositories/IAdminRepository';

const { logAndReturnErrorMock } = vi.hoisted(() => ({
  logAndReturnErrorMock: vi.fn().mockResolvedValue({
    code: 'TOKEN_VERIFY_FAILED',
    message: 'invalid',
    module: 'use-case',
    method: 'AuthAdminUseCase.verifyToken',
  }),
}));

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: logAndReturnErrorMock, logError: vi.fn() },
}));

vi.mock('@/lib/token-revocation', () => ({
  isTokenRevoked: vi.fn().mockResolvedValue(false),
}));

const noopRepo = {} as IAdminRepository;

beforeEach(() => {
  logAndReturnErrorMock.mockClear();
  process.env.ACCESS_TOKEN_SECRET = 'secreto-de-test';
});

describe('AuthAdminUseCase.verifyToken — token invalido/expirado', () => {
  it('loguea con severity "warning" (ciclo de vida normal, no un bug)', async () => {
    const useCase = new AuthAdminUseCase(noopRepo);

    const resultado = await useCase.verifyToken('esto-no-es-un-jwt-valido');

    expect(resultado).toBeNull();
    expect(logAndReturnErrorMock).toHaveBeenCalledTimes(1);
    const options = logAndReturnErrorMock.mock.calls[0][4];
    expect(options.severity).toBe('warning');
  });
});
