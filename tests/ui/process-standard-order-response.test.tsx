import { describe, it, expect, vi } from 'vitest';
import { processStandardOrderResponse } from '@/components/cart-drawer';

function buildOpts(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: string[] = [];
  const sendStandardOrderFlow = vi.fn(async () => ({ ok: true, data: { numeroPedido: 42 } }));
  return {
    calls,
    opts: {
      t: (key: string) => key,
      language: 'es',
      isRestaurant: false,
      pagosPickupHabilitados: false,
      deliveryMethod: null,
      deliveryAddress: '',
      deliveryPostalCode: '',
      deliveryLatitude: null,
      deliveryLongitude: null,
      estimatedFeeCents: null,
      clearCart: () => calls.push('clearCart'),
      closeCart: () => calls.push('closeCart'),
      openCart: () => calls.push('openCart'),
      addTrackingToken: () => calls.push('addTrackingToken'),
      setOrderSuccess: () => calls.push('setOrderSuccess'),
      setErrors: () => calls.push('setErrors'),
      setNombre: () => {},
      setTelefono: () => {},
      setEmail: () => {},
      router: {},
      sendStandardOrderFlow,
      setSending: () => calls.push('setSending'),
      attemptKey: { current: () => 'k', renew: () => {}, reset: () => calls.push('attemptKey.reset') },
      ...overrides,
    },
  };
}

describe('processStandardOrderResponse', () => {
  it('cierra el carrito ANTES de que la promesa de envío resuelva (optimista)', async () => {
    const { calls, opts } = buildOpts();
    let closedBeforeResolve = false;
    opts.sendStandardOrderFlow = vi.fn(async () => {
      closedBeforeResolve = calls.includes('closeCart');
      return { ok: true, data: { numeroPedido: 42 } };
    });

    await processStandardOrderResponse({}, opts as any);

    expect(closedBeforeResolve).toBe(true);
  });

  it('éxito sin trackingToken: muestra el éxito, sin reabrir el carrito', async () => {
    const { calls, opts } = buildOpts();

    await processStandardOrderResponse({}, opts as any);

    expect(calls).toContain('setOrderSuccess');
    expect(calls).not.toContain('openCart');
  });

  it('fallo del servidor (ok=false): reabre el carrito y muestra el error', async () => {
    const { calls, opts } = buildOpts({
      sendStandardOrderFlow: vi.fn(async () => ({ ok: false, data: { error: 'pago rechazado' } })),
    });

    await processStandardOrderResponse({}, opts as any);

    expect(calls).toContain('openCart');
    expect(calls).toContain('setErrors');
    expect(calls).not.toContain('clearCart');
  });

  it('fallo de red: reabre el carrito y muestra el error', async () => {
    const { calls, opts } = buildOpts({
      sendStandardOrderFlow: vi.fn(async () => { throw new Error('network down'); }),
    });

    await processStandardOrderResponse({}, opts as any);

    expect(calls).toContain('openCart');
    expect(calls).toContain('setErrors');
    expect(calls).not.toContain('clearCart');
  });
});
