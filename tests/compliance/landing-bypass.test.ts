import { describe, it, expect } from 'vitest';
import { shouldBypassLanding } from '@/lib/landing/should-bypass-landing';

describe('shouldBypassLanding — cuándo "/" sigue sirviendo la carta en vez de la landing', () => {
  it('bypassa con ?mesa= presente (QR de mesa)', () => {
    expect(shouldBypassLanding({ hasMesaParam: true, isWaiterMode: false, isPedidosSubdomain: false })).toBe(true);
  });

  it('bypassa en modo camarero', () => {
    expect(shouldBypassLanding({ hasMesaParam: false, isWaiterMode: true, isPedidosSubdomain: false })).toBe(true);
  });

  it('bypassa en el subdominio pedidos', () => {
    expect(shouldBypassLanding({ hasMesaParam: false, isWaiterMode: false, isPedidosSubdomain: true })).toBe(true);
  });

  it('no bypassa sin ninguna señal — se muestra la landing', () => {
    expect(shouldBypassLanding({ hasMesaParam: false, isWaiterMode: false, isPedidosSubdomain: false })).toBe(false);
  });
});
