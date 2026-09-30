import { describe, it, expect } from 'vitest';
import { aplicaPagina, paginasLegalesDe, type FlagsPaginas } from '@/lib/legal/paginas-legales';

const restaurante: FlagsPaginas = { tipo: 'restaurante', deliveryHabilitado: false, envioDomicilioHabilitado: false };
const tienda: FlagsPaginas = { tipo: 'tienda', deliveryHabilitado: false, envioDomicilioHabilitado: false };

const slugs = (f: FlagsPaginas) => paginasLegalesDe(f).map((p) => p.slug);

describe('paginasLegalesDe', () => {
  it('restaurante sin reparto: aviso legal, privacidad y condiciones', () => {
    expect(slugs(restaurante)).toEqual(['aviso-legal', 'privacidad', 'condiciones']);
  });

  it('restaurante con Glovo: NO gana envíos ni devoluciones (perecederos, art. 103.d)', () => {
    expect(slugs({ ...restaurante, deliveryHabilitado: true })).toEqual(['aviso-legal', 'privacidad', 'condiciones']);
  });

  it('restaurante con envioDomicilio a true por error: sigue sin envíos', () => {
    expect(slugs({ ...restaurante, envioDomicilioHabilitado: true })).not.toContain('envios-y-pagos');
  });

  it('tienda sin envío: devoluciones sí, envíos no', () => {
    expect(slugs(tienda)).toEqual(['aviso-legal', 'privacidad', 'condiciones', 'devoluciones']);
  });

  it('tienda con envío: las cinco, en orden', () => {
    expect(slugs({ ...tienda, envioDomicilioHabilitado: true })).toEqual([
      'aviso-legal', 'privacidad', 'condiciones', 'envios-y-pagos', 'devoluciones',
    ]);
  });

  it('tipo null (empresa mal configurada): solo las obligatorias', () => {
    expect(slugs({ ...tienda, tipo: null })).toEqual(['aviso-legal', 'privacidad', 'condiciones']);
  });

  it('cada página expone su href', () => {
    expect(paginasLegalesDe(tienda).every((p) => p.href === `/${p.slug}`)).toBe(true);
  });
});

describe('aplicaPagina', () => {
  it('coincide con paginasLegalesDe', () => {
    expect(aplicaPagina(restaurante, 'devoluciones')).toBe(false);
    expect(aplicaPagina(tienda, 'devoluciones')).toBe(true);
    expect(aplicaPagina(restaurante, 'aviso-legal')).toBe(true);
  });
});
