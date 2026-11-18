// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), DD3 de design.md:
// token de gestión aleatorio (256 bits, base64url), guardado en claro en
// `baja_token` (sirve para confirmar y para la baja, D-M2b-3).
import { describe, expect, it } from 'vitest';
import { esTokenGestion, generarTokenGestion } from '@/lib/kit-caducidad/token-gestion';

describe('generarTokenGestion', () => {
  it('mide 43 caracteres y cumple el patrón base64url', () => {
    const token = generarTokenGestion();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('genera 1000 tokens, todos distintos', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generarTokenGestion()));
    expect(tokens.size).toBe(1000);
  });
});

describe('esTokenGestion', () => {
  it('acepta un token válido', () => {
    expect(esTokenGestion(generarTokenGestion())).toBe(true);
  });

  it('rechaza la cadena vacía', () => {
    expect(esTokenGestion('')).toBe(false);
  });

  it('rechaza 42 caracteres', () => {
    expect(esTokenGestion('a'.repeat(42))).toBe(false);
  });

  it('rechaza 44 caracteres', () => {
    expect(esTokenGestion('a'.repeat(44))).toBe(false);
  });

  it('rechaza el carácter "+"', () => {
    expect(esTokenGestion(`${'a'.repeat(42)}+`)).toBe(false);
  });

  it('rechaza el carácter "/"', () => {
    expect(esTokenGestion(`${'a'.repeat(42)}/`)).toBe(false);
  });

  it('rechaza el carácter "="', () => {
    expect(esTokenGestion(`${'a'.repeat(42)}=`)).toBe(false);
  });
});
