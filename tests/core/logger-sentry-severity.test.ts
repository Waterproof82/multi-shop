/**
 * ErrorLogger — filtrado de severidad antes de reenviar a Sentry.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `logError()` reenviaba TODO a Sentry sin mirar `severity` — un intento de
 * login con contraseña incorrecta (comportamiento normal de usuario, no un
 * bug) se capturaba como excepción de aplicación igual que un fallo real.
 * Con tráfico normal, eso ahoga el dashboard de Sentry con ruido esperado y
 * hace más difícil ver los errores de verdad (y consume cuota de eventos).
 *
 * Contrato: `severity: 'warning'` se loguea igual (auditoría/analítica en
 * `log_errors`) pero NO dispara `captureException`. `'error'` y `'critical'`
 * sí lo disparan — son los que representan un fallo real de la aplicación.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureExceptionMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

// El logger detecta server-side comprobando `globalThis.window === undefined`,
// que ya es cierto en el entorno de test (Vitest, sin jsdom en este proyecto).
vi.mock('../../src/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: () => {
    throw new Error('Supabase not configured in test');
  },
}));

beforeEach(() => {
  captureExceptionMock.mockClear();
  vi.resetModules();
});

async function cargarLogger() {
  const mod = await import('@/core/infrastructure/logging/logger');
  return mod.ErrorLogger.getInstance();
}

describe('ErrorLogger — severidad y Sentry', () => {
  it('severity "warning" se loguea pero NO se reenvía a Sentry', async () => {
    const logger = await cargarLogger();
    await logger.logError({
      codigo: 'AUTH_LOGIN_ERROR',
      mensaje: 'Credenciales inválidas',
      modulo: 'repository',
      severity: 'warning',
    });
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('severity "error" (default) sí se reenvía a Sentry', async () => {
    const logger = await cargarLogger();
    await logger.logError({
      codigo: 'UNHANDLED_ERROR',
      mensaje: 'Algo explotó de verdad',
      modulo: 'use-case',
    });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('severity "critical" también se reenvía a Sentry', async () => {
    const logger = await cargarLogger();
    await logger.logError({
      codigo: 'PAYMENT_TRIGGER_FAILED',
      mensaje: 'Trigger de cobro fallo',
      modulo: 'repository',
      severity: 'critical',
    });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
