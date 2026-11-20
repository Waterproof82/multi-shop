import { describe, expect, it } from 'vitest';
import { PET_PERFIL_PUBLICO_LIVE, PET_ALTA_LIVE } from '@/lib/pet-id/publico';

// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// design.md: las banderas quedan en `false` hasta el PR17 — cada PR previo
// es inerte en producción (perfil público y alta de chapas apagados). El
// PR17 las pone a `true` en el mismo commit que actualiza este test (igual
// patrón que `kit-caducidad/publico.ts`).

describe('PET_PERFIL_PUBLICO_LIVE', () => {
  it('es false: el perfil público todavía no está activo', () => {
    expect(PET_PERFIL_PUBLICO_LIVE).toBe(false);
  });
});

describe('PET_ALTA_LIVE', () => {
  it('es false: el alta de chapas todavía no está activa', () => {
    expect(PET_ALTA_LIVE).toBe(false);
  });
});
