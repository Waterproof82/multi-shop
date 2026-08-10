/**
 * processGlovoWebhookUseCase — severidad de los casos ya tratados como
 * no-fatales por el propio código.
 *
 * El use case ya decide "log y devolver 200" para un webhook malformado o
 * para un pedido que no existe (Glovo exige 200 siempre, y ambos casos son
 * eventos externos esperados: reintentos, carreras, pedidos de prueba ya
 * borrados). La severidad no reflejaba esa decisión — se logueaban con el
 * 'error' por defecto, capturándose en Sentry como excepción real.
 * `GLOVO_WEBHOOK_UPDATE_ERROR` es distinto: ahí SÍ fallamos nosotros al
 * escribir en nuestra propia DB, así que se queda en 'error'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logAndReturnErrorMock, logFromCatchMock } = vi.hoisted(() => ({
  logAndReturnErrorMock: vi.fn().mockResolvedValue({}),
  logFromCatchMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logAndReturnError: logAndReturnErrorMock, logFromCatch: logFromCatchMock },
}));

const { fakeSupabase, setFindResult, setUpdateResult } = vi.hoisted(() => {
  let findResult: { data: unknown; error: unknown } = { data: null, error: null };
  let updateResult: { error: unknown } = { error: null };
  return {
    fakeSupabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => findResult }) }),
        update: () => ({ eq: () => ({ eq: async () => updateResult }) }),
      }),
    },
    setFindResult: (r: { data: unknown; error: unknown }) => { findResult = r; },
    setUpdateResult: (r: { error: unknown }) => { updateResult = r; },
  };
});

vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: () => fakeSupabase,
}));

import { processGlovoWebhookUseCase } from '@/core/application/use-cases/glovo/processGlovoWebhookUseCase';

beforeEach(() => {
  logAndReturnErrorMock.mockClear();
  logFromCatchMock.mockClear();
  setFindResult({ data: { id: 'pedido-1', empresa_id: 'emp-1' }, error: null });
  setUpdateResult({ error: null });
});

describe('processGlovoWebhookUseCase — severidad', () => {
  it('payload malformado (sin orderId/status): severity "warning"', async () => {
    await processGlovoWebhookUseCase({});

    expect(logAndReturnErrorMock).toHaveBeenCalledTimes(1);
    expect(logAndReturnErrorMock.mock.calls[0][0]).toBe('GLOVO_WEBHOOK_MALFORMED');
    expect(logAndReturnErrorMock.mock.calls[0][4].severity).toBe('warning');
  });

  it('pedido no encontrado por glovo_order_id: severity "warning"', async () => {
    setFindResult({ data: null, error: null });

    await processGlovoWebhookUseCase({ order_id: 'glovo-123', status: 'COMPLETED' });

    expect(logAndReturnErrorMock).toHaveBeenCalledTimes(1);
    expect(logAndReturnErrorMock.mock.calls[0][0]).toBe('GLOVO_WEBHOOK_ORDER_NOT_FOUND');
    expect(logAndReturnErrorMock.mock.calls[0][4].severity).toBe('warning');
  });

  it('fallo real al actualizar el pedido (GLOVO_WEBHOOK_UPDATE_ERROR): sigue en severity "error" (default)', async () => {
    setUpdateResult({ error: { message: 'boom' } });

    await processGlovoWebhookUseCase({ order_id: 'glovo-123', status: 'COMPLETED' });

    expect(logAndReturnErrorMock).toHaveBeenCalledTimes(1);
    expect(logAndReturnErrorMock.mock.calls[0][0]).toBe('GLOVO_WEBHOOK_UPDATE_ERROR');
    expect(logAndReturnErrorMock.mock.calls[0][4]?.severity).toBeUndefined();
  });
});
