/**
 * logClientError — clasificación automática de severidad.
 *
 * Los ~11 puntos de llamada de este helper en el panel admin son, sin
 * excepción, un `catch (error)` envolviendo un `fetch()`. Un fallo de RED
 * (`TypeError: Failed to fetch` — sin conexión, WiFi degradado) es la
 * condición documentada como normal en esta app (ver "Offline, Resiliencia"
 * en CLAUDE.md), no un bug. Un error de OTRO tipo dentro de ese mismo catch
 * (p. ej. `res.json()` fallando por una respuesta malformada) sí indica que
 * algo se rompió de verdad entre el front y el back.
 *
 * Antes de este fix, `logClientError` capturaba TODO como excepción, con
 * `severity: 'error'` fijo — igual que el bug ya corregido en `logger.ts`
 * (server-side), pero sin ninguna forma de distinguir el caso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { captureExceptionMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: captureExceptionMock,
}));

import { logClientError } from '@/lib/client-error';

beforeEach(() => {
  captureExceptionMock.mockClear();
});

describe('logClientError — severidad automática', () => {
  it('TypeError (fallo de red del fetch): severity "warning", NO se captura en Sentry', () => {
    const appError = logClientError(new TypeError('Failed to fetch'), 'cargarPedidos');

    expect(appError.severity).toBe('warning');
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('Error genérico (p. ej. res.json() malformado): severity "error", SÍ se captura', () => {
    const appError = logClientError(new Error('Unexpected token in JSON'), 'cargarPedidos');

    expect(appError.severity).toBe('error');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it('valor no-Error lanzado: severity "error" (caso inesperado), SÍ se captura', () => {
    const appError = logClientError('algo raro', 'cargarPedidos');

    expect(appError.severity).toBe('error');
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
  });
});
