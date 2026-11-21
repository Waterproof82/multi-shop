// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
// Fase 10 (R-QR.4/R-QR.9/DD6): Zod en la frontera (ruta → caso de uso),
// calco de `kit-avisos.dto.ts` con los campos del alta de una chapa.
import { describe, expect, it } from 'vitest';
import { altaChapaSchema } from '@/core/application/dtos/pet-chapa.dto';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';

// Lección de PR9: un literal inventado falla el dígito de control de
// Crockford — se genera un código real con bytes fijos.
const CODIGO = generarCodigoChapa(() => Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05]));

function base(overrides: Record<string, unknown> = {}) {
  return {
    codigo: CODIGO,
    email: 'Ana@Ejemplo.com',
    nombre: 'Luna',
    especie: 'perro',
    aceptaPrivacidad: true,
    aceptaPublicacion: true,
    ...overrides,
  };
}

describe('altaChapaSchema', () => {
  it('acepta un payload mínimo válido', () => {
    const r = altaChapaSchema.safeParse(base());
    expect(r.success).toBe(true);
  });

  it('rechaza un código con forma inválida', () => {
    const r = altaChapaSchema.safeParse(base({ codigo: 'M-0000-0000-Z' }));
    expect(r.success).toBe(false);
  });

  it('rechaza una serie de kit en vez de un código de chapa (prefijos distintos)', () => {
    const r = altaChapaSchema.safeParse(base({ codigo: 'KEC-ABCD-1234-5' }));
    expect(r.success).toBe(false);
  });

  it('normaliza el email con trim y minúsculas', () => {
    const r = altaChapaSchema.safeParse(base({ email: '  Ana@Ejemplo.com  ' }));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ana@ejemplo.com');
  });

  it('rechaza un email de más de 254 caracteres', () => {
    const emailLargo = `${'a'.repeat(250)}@x.es`;
    const r = altaChapaSchema.safeParse(base({ email: emailLargo }));
    expect(r.success).toBe(false);
  });

  it('rechaza sin aceptaPrivacidad: true', () => {
    const r = altaChapaSchema.safeParse(base({ aceptaPrivacidad: false }));
    expect(r.success).toBe(false);
  });

  it('rechaza sin aceptaPublicacion: true (DD6: sin ella la chapa no muestra nada)', () => {
    const r = altaChapaSchema.safeParse(base({ aceptaPublicacion: false }));
    expect(r.success).toBe(false);
  });

  it('rechaza una especie distinta de perro/gato', () => {
    const r = altaChapaSchema.safeParse(base({ especie: 'loro' }));
    expect(r.success).toBe(false);
  });

  it('rechaza un nombre vacío', () => {
    const r = altaChapaSchema.safeParse(base({ nombre: '' }));
    expect(r.success).toBe(false);
  });

  it('rechaza un nombre de más de 40 caracteres', () => {
    const r = altaChapaSchema.safeParse(base({ nombre: 'L'.repeat(41) }));
    expect(r.success).toBe(false);
  });

  it('las notas son opcionales', () => {
    const r = altaChapaSchema.safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notas).toBeUndefined();
  });

  it('acepta notas de hasta 280 caracteres', () => {
    const r = altaChapaSchema.safeParse(base({ notas: 'N'.repeat(280) }));
    expect(r.success).toBe(true);
  });

  it('rechaza notas de más de 280 caracteres', () => {
    const r = altaChapaSchema.safeParse(base({ notas: 'N'.repeat(281) }));
    expect(r.success).toBe(false);
  });

  it('rechaza notas que contienen un email (R-QR.9.2)', () => {
    const r = altaChapaSchema.safeParse(base({ notas: 'Escríbeme a ana@ejemplo.com si la encuentras' }));
    expect(r.success).toBe(false);
  });

  it('rechaza notas que contienen un teléfono (R-QR.9.2)', () => {
    const r = altaChapaSchema.safeParse(base({ notas: 'Llámame al 600 111 222' }));
    expect(r.success).toBe(false);
  });
});
