import { describe, it, expect } from 'vitest';
import { createModalidadEntregaSchema, updateModalidadEntregaSchema } from '@/core/application/dtos/modalidad-entrega.dto';

describe('createModalidadEntregaSchema', () => {
  it('rechaza tipo recogida — ya no es una modalidad creable, es implícita en el backend', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'recogida',
      icono: 'store',
      nombre_es: 'Recogida rápida',
      precioCents: 0,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some(i => i.path[0] === 'tipo')).toBe(true);
    }
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

  it('sigue aplicando orden=0 por defecto al crear si no se manda', () => {
    const parsed = createModalidadEntregaSchema.safeParse({
      empresaId: '11111111-1111-1111-8111-111111111111',
      tipo: 'domicilio',
      icono: 'bike',
      nombre_es: 'Envío estándar',
      precioCents: 350,
      tiempoMinMinutos: 30,
      tiempoMaxMinutos: 60,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.orden).toBe(0);
    }
  });
});

// I5 — `.default(0)` en el campo base sobrevivía a `.partial()` en Zod v4: cada
// PUT de update reescribía `orden=0` en la DB aunque el caller nunca lo mandara,
// pisando el valor real guardado (p. ej. una modalidad reordenada a la posición 3).
describe('updateModalidadEntregaSchema', () => {
  it('NO incluye `orden` en el resultado si el caller no lo manda (bug real: sobrevivía a .partial())', () => {
    const parsed = updateModalidadEntregaSchema.safeParse({ activo: false });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('orden' in parsed.data).toBe(false);
    }
  });

  it('SÍ incluye `orden` cuando el caller lo manda explícitamente', () => {
    const parsed = updateModalidadEntregaSchema.safeParse({ orden: 3 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.orden).toBe(3);
    }
  });
});
