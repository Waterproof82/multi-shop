import { describe, it, expect } from 'vitest';
import { resolverVolverALanding } from '@/lib/landing/volver-a-landing';

describe('resolverVolverALanding', () => {
  const base = {
    desdeRutaCarta: false,
    isPedidos: false,
    rawMesaParam: false,
    isWaiterMode: false,
    landingHabilitada: true,
  };

  it('dominio principal /carta: enlace relativo a /', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'almadearena.es', desdeRutaCarta: true });
    expect(r.mostrar).toBe(true);
    expect(r.urlInicio).toBe('/');
    expect(r.baseUrl).toBe('');
  });

  it('subdominio pedidos.X: enlace absoluto al dominio principal', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'pedidos.almadearena.es', isPedidos: true });
    expect(r.mostrar).toBe(true);
    expect(r.urlInicio).toBe('https://almadearena.es/');
    expect(r.baseUrl).toBe('https://almadearena.es');
  });

  it('subdominio con sufijo -pedidos (host local): enlace absoluto', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'almadearena-pedidos', isPedidos: true });
    expect(r.mostrar).toBe(true);
    expect(r.urlInicio).toBe('https://almadearena/');
    expect(r.baseUrl).toBe('https://almadearena');
  });

  it('localhost: usa http', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'pedidos.localhost', isPedidos: true });
    expect(r.urlInicio).toBe('http://localhost/');
  });

  it('pedidos con landing deshabilitada: SI mostrar (vuelve a la carta del dominio principal)', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'pedidos.almadearena.es', isPedidos: true, landingHabilitada: false });
    expect(r.mostrar).toBe(true);
    expect(r.urlInicio).toBe('https://almadearena.es/');
    expect(r.baseUrl).toBe('https://almadearena.es');
  });

  it('dominio principal /carta con landing deshabilitada: no mostrar', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'almadearena.es', desdeRutaCarta: true, landingHabilitada: false });
    expect(r.mostrar).toBe(false);
  });

  it('?mesa presente: no mostrar', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'pedidos.almadearena.es', isPedidos: true, rawMesaParam: true });
    expect(r.mostrar).toBe(false);
  });

  it('modo camarero: no mostrar', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'pedidos.almadearena.es', isPedidos: true, isWaiterMode: true });
    expect(r.mostrar).toBe(false);
  });

  it('dominio principal sin landing pero sin pedidos: no mostrar', () => {
    const r = resolverVolverALanding({ ...base, fullDomain: 'almadearena.es', desdeRutaCarta: false, landingHabilitada: true });
    expect(r.mostrar).toBe(false);
  });
});
