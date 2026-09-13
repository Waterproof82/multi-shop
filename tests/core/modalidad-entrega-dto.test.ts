import { describe, it, expect } from 'vitest';
import { createModalidadEntregaSchema } from '@/core/application/dtos/modalidad-entrega.dto';

describe('createModalidadEntregaSchema', () => {
  it('acepta recogida sin tiempoMinMinutos/tiempoMaxMinutos', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza recogida con tiempoMinMinutos presente', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
      tiempoMinMinutos: 10,
    });
    expect(parsed.success).toBe(false);
  });

  it('acepta domicilio con rango de tiempo', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 120,
      tiempoMaxMinutos: 180,
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza tiempoMinMinutos mayor que tiempoMaxMinutos', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 180,
      tiempoMaxMinutos: 120,
    });
    expect(parsed.success).toBe(false);
  });

  it('acepta tiempoMinMinutos igual a tiempoMaxMinutos', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío exprés',
      precioCents: 500,
      tiempoMinMinutos: 100,
      tiempoMaxMinutos: 100,
    });
    expect(parsed.success).toBe(true);
  });

  it('rechaza recogida con solo tiempoMaxMinutos presente (sin tiempoMinMinutos)', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
      tiempoMaxMinutos: 10,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some(i => i.path[0] === 'tiempoMaxMinutos')).toBe(true);
    }
  });
});
