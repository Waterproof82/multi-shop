/**
 * SupabaseAdminRepository.loginWithPassword — severidad del log ante
 * credenciales inválidas.
 *
 * Un intento de login con contraseña incorrecta es comportamiento normal de
 * usuario (typo, contraseña olvidada), no un bug de la aplicación. Debe
 * quedar registrado (auditoría), pero con `severity: 'warning'` para que
 * `ErrorLogger` no lo capture como excepción en Sentry — ver
 * `tests/core/logger-sentry-severity.test.ts` para el contrato de ese filtro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const { logAndReturnErrorMock } = vi.hoisted(() => ({
  logAndReturnErrorMock: vi.fn().mockResolvedValue({
    code: 'AUTH_LOGIN_ERROR',
    message: 'Credenciales inválidas',
    module: 'repository',
    method: 'loginWithPassword',
  }),
}));

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: logAndReturnErrorMock, logFromCatch: vi.fn() },
}));

import { SupabaseAdminRepository } from '@/core/infrastructure/database/SupabaseAdminRepository';

function fakeSupabaseAnon(authError: { message: string; code?: string; status?: number } | null) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        error: authError,
        data: authError ? null : { user: { id: 'user-1' } },
      }),
    },
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  logAndReturnErrorMock.mockClear();
});

describe('SupabaseAdminRepository.loginWithPassword', () => {
  it('credenciales inválidas: loguea con severity "warning" (no es un bug)', async () => {
    const repo = new SupabaseAdminRepository(
      {} as SupabaseClient,
      fakeSupabaseAnon({ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 }),
    );

    await repo.loginWithPassword('user@example.com', 'wrong-password');

    expect(logAndReturnErrorMock).toHaveBeenCalledTimes(1);
    const options = logAndReturnErrorMock.mock.calls[0][4];
    expect(options.severity).toBe('warning');
  });
});
