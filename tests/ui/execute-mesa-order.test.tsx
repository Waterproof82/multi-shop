import { describe, it, expect, vi } from 'vitest';
import { executeMesaOrder, type MesaOrderHandlers } from '@/components/cart-drawer';
import type { CartItem } from '@/lib/cart-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';

const ITEM: CartItem = {
  cartId: 'c1',
  item: { id: 'p1', name: 'Tortilla', price: 5 } as unknown as MenuItemVM,
  quantity: 1,
};

function buildHandlers(): MesaOrderHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setSending: () => calls.push('setSending'),
    closeCart: () => calls.push('closeCart'),
    openCart: () => calls.push('openCart'),
    setQrGateState: () => calls.push('setQrGateState'),
    clearCart: () => calls.push('clearCart'),
    setShowOrderToast: () => calls.push('setShowOrderToast'),
    setErrors: () => calls.push('setErrors'),
    attemptKey: { current: () => 'k', renew: () => {}, reset: () => calls.push('attemptKey.reset') },
  };
}

describe('executeMesaOrder — modo camarero (isWaiterMode=true, sin client token)', () => {
  it('cierra el carrito ANTES de que la promesa de envío resuelva (optimista)', async () => {
    const handlers = buildHandlers();
    let closedBeforeResolve = false;
    const sendFlow = vi.fn(async () => {
      closedBeforeResolve = handlers.calls.includes('closeCart');
      return { ok: true, trackingToken: 'tok', pedidoId: 'p1' };
    });

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(closedBeforeResolve).toBe(true);
  });

  it('éxito: limpia el carrito y muestra el toast, sin reabrir', async () => {
    const handlers = buildHandlers();
    const sendFlow = vi.fn(async () => ({ ok: true, trackingToken: 'tok', pedidoId: 'p1' }));

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(handlers.calls).toContain('clearCart');
    expect(handlers.calls).toContain('setShowOrderToast');
    expect(handlers.calls).not.toContain('openCart');
  });

  it('fallo del servidor: reabre el carrito y muestra el error, sin limpiarlo', async () => {
    const handlers = buildHandlers();
    const sendFlow = vi.fn(async () => ({ ok: false, error: 'stock agotado' }));

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(handlers.calls).toContain('openCart');
    expect(handlers.calls).toContain('setErrors');
    expect(handlers.calls).not.toContain('clearCart');
  });

  it('fallo de red: reabre el carrito y muestra el error', async () => {
    const handlers = buildHandlers();
    const sendFlow = vi.fn(async () => { throw new Error('network down'); });

    await executeMesaOrder('mesa-1', true, [ITEM], 'es', handlers, sendFlow);

    expect(handlers.calls).toContain('openCart');
    expect(handlers.calls).toContain('setErrors');
    expect(handlers.calls).not.toContain('clearCart');
  });
});
