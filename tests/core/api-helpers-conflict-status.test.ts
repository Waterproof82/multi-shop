/**
 * Regresión: `ProductUseCase.create`/`update` devuelven `code: 'CONFLICT'`
 * cuando un slug autogenerado colisiona incluso tras el reintento (ver
 * product.use-case.ts). `errorCodeToStatus` no tenía ninguna rama para ese
 * código y caía en el 500 genérico: el admin veía "Error al guardar" en vez
 * de un 409 que la UI pudiera traducir a un mensaje útil ("ese slug ya está
 * en uso, prueba con otro").
 */
import { describe, it, expect } from 'vitest';
import { handleResult, handleResultWithStatus } from '@/core/infrastructure/api/helpers';

describe('handleResult — código CONFLICT', () => {
  it('mapea CONFLICT a 409, no al 500 genérico', async () => {
    const res = handleResult({
      success: false,
      error: { code: 'CONFLICT', message: 'El slug ya está en uso', module: 'use-case', method: 'ProductUseCase.create' },
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'El slug ya está en uso' });
  });

  it('handleResultWithStatus respeta el mismo mapeo de error', async () => {
    const res = handleResultWithStatus({
      success: false,
      error: { code: 'CONFLICT', message: 'El slug ya está en uso', module: 'use-case', method: 'ProductUseCase.update' },
    });
    expect(res.status).toBe(409);
  });
});
