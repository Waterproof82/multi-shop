// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), R-M2b.2.2/R-M2b.4
// y DD contratos de design.md: Zod en la frontera (ruta → caso de uso).
import { describe, expect, it } from 'vitest';
import { altaAvisosSchema, enlaceGestionSchema, gestionSchema } from '@/core/application/dtos/kit-avisos.dto';

describe('altaAvisosSchema', () => {
  const base = { serie: 'KEC-ABCD-1234-5', email: 'Ana@Ejemplo.com', aceptaPrivacidad: true, avisosEmail: true };

  it('acepta un payload mínimo válido', () => {
    const r = altaAvisosSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rechaza sin aceptaPrivacidad: true', () => {
    const r = altaAvisosSchema.safeParse({ ...base, aceptaPrivacidad: false });
    expect(r.success).toBe(false);
  });

  it('rechaza sin avisosEmail: true', () => {
    const r = altaAvisosSchema.safeParse({ ...base, avisosEmail: false });
    expect(r.success).toBe(false);
  });

  it('rechaza avisosWhatsapp: true sin teléfono', () => {
    const r = altaAvisosSchema.safeParse({ ...base, avisosWhatsapp: true });
    expect(r.success).toBe(false);
  });

  it('acepta avisosWhatsapp: true con teléfono', () => {
    const r = altaAvisosSchema.safeParse({ ...base, avisosWhatsapp: true, telefono: '+34600111222' });
    expect(r.success).toBe(true);
  });

  it('normaliza el email con trim y minúsculas', () => {
    const r = altaAvisosSchema.safeParse({ ...base, email: '  Ana@Ejemplo.com  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ana@ejemplo.com');
  });

  it('rechaza un email de más de 254 caracteres', () => {
    const emailLargo = `${'a'.repeat(250)}@x.es`;
    const r = altaAvisosSchema.safeParse({ ...base, email: emailLargo });
    expect(r.success).toBe(false);
  });

  it('del teléfono solo quedan "+" y dígitos, como máximo 20 caracteres', () => {
    const r = altaAvisosSchema.safeParse({ ...base, avisosWhatsapp: true, telefono: '+34 600 111 222' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefono).toBe('+34600111222');
  });

  it('rechaza un teléfono con más de 20 caracteres tras limpiarlo', () => {
    const r = altaAvisosSchema.safeParse({ ...base, avisosWhatsapp: true, telefono: `+${'1'.repeat(25)}` });
    expect(r.success).toBe(false);
  });

  it('rechaza una serie de más de 40 caracteres', () => {
    const r = altaAvisosSchema.safeParse({ ...base, serie: 'K'.repeat(41) });
    expect(r.success).toBe(false);
  });
});

describe('enlaceGestionSchema', () => {
  it('acepta serie + email', () => {
    const r = enlaceGestionSchema.safeParse({ serie: 'KEC-ABCD-1234-5', email: 'ana@ejemplo.com' });
    expect(r.success).toBe(true);
  });

  it('rechaza sin email', () => {
    const r = enlaceGestionSchema.safeParse({ serie: 'KEC-ABCD-1234-5' });
    expect(r.success).toBe(false);
  });

  it('normaliza el email', () => {
    const r = enlaceGestionSchema.safeParse({ serie: 'KEC-ABCD-1234-5', email: '  Ana@Ejemplo.com  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ana@ejemplo.com');
  });
});

describe('gestionSchema', () => {
  it('acepta token + accion: confirmar', () => {
    const r = gestionSchema.safeParse({ token: 'a'.repeat(43), accion: 'confirmar' });
    expect(r.success).toBe(true);
  });

  it('acepta token + accion: baja', () => {
    const r = gestionSchema.safeParse({ token: 'a'.repeat(43), accion: 'baja' });
    expect(r.success).toBe(true);
  });

  it('rechaza una accion distinta de confirmar/baja', () => {
    const r = gestionSchema.safeParse({ token: 'a'.repeat(43), accion: 'otra' });
    expect(r.success).toBe(false);
  });

  it('rechaza un token mal formado', () => {
    const r = gestionSchema.safeParse({ token: 'demasiado-corto', accion: 'confirmar' });
    expect(r.success).toBe(false);
  });
});
