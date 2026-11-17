import { describe, it, expect } from 'vitest';
import { updateEmpresaSchema, superadminUpdateEmpresaSchema } from '@/core/application/dtos/empresa.dto';

/**
 * Mismo agujero que `tpv_habilitado` (ver tpv-habilitado-solo-superadmin.test.ts):
 * `updateEmpresaSchema` lo usa también `/api/admin/empresa` (el admin de cada
 * tenant). Si `kits_caducidad_habilitado` entrara ahí, cualquier admin de
 * tienda podría activarse el módulo de kits — que expone datos personales de
 * los registros — con una petición hecha a mano (R-M4.1.2).
 */
describe('kits_caducidad_habilitado — solo lo cambia el superadmin', () => {
  it('el esquema del admin de tenant lo DESCARTA', () => {
    const r = updateEmpresaSchema.safeParse({ kits_caducidad_habilitado: true });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('kits_caducidad_habilitado');
  });

  it('el esquema del superadmin lo acepta', () => {
    const r = superadminUpdateEmpresaSchema.safeParse({ kits_caducidad_habilitado: true });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ kits_caducidad_habilitado: true });
  });

  it('el esquema del superadmin rechaza un valor que no sea booleano', () => {
    expect(superadminUpdateEmpresaSchema.safeParse({ kits_caducidad_habilitado: 'si' }).success).toBe(false);
  });
});
