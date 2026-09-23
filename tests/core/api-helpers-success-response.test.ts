/**
 * Regresión: `successResponse`/`handleResultWithStatus` crasheaban con
 * "Value is not JSON serializable" (NextResponse.json(undefined, ...) lanza)
 * en CUALQUIER endpoint admin que devuelve Result<void> — delete, setProductos,
 * addProductos, etc. Nunca se había disparado en vivo hasta que se probó de
 * punta a punta el endpoint POST de asignación masiva de menús virtuales.
 * Ver docs/superpowers/plans/2026-09-16-menus-virtuales.md, Task 21.
 */
import { describe, it, expect } from 'vitest';
import { successResponse, handleResultWithStatus } from '@/core/infrastructure/api/helpers';

describe('successResponse', () => {
  it('serializa undefined como null en vez de lanzar', async () => {
    const res = successResponse(undefined);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeNull();
  });

  it('serializa datos reales sin cambios', async () => {
    const res = successResponse({ id: '1' });
    await expect(res.json()).resolves.toEqual({ id: '1' });
  });
});

describe('handleResultWithStatus', () => {
  it('no lanza para un Result<void> exitoso (delete, setProductos, addProductos)', async () => {
    const res = handleResultWithStatus({ success: true, data: undefined });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toBeNull();
  });

  it('respeta el status code pedido para Result<void>', async () => {
    const res = handleResultWithStatus({ success: true, data: undefined }, 201);
    expect(res.status).toBe(201);
  });

  it('sigue devolviendo datos reales para un Result<T> exitoso', async () => {
    const res = handleResultWithStatus({ success: true, data: { foo: 'bar' } });
    await expect(res.json()).resolves.toEqual({ foo: 'bar' });
  });
});
