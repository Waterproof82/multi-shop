import { describe, it, expect } from 'vitest';
import { updateEmpresaSchema, superadminUpdateEmpresaSchema } from '@/core/application/dtos/empresa.dto';

/**
 * `updateEmpresaSchema` lo usa TAMBIÉN `/api/admin/empresa` (el admin de cada
 * tenant). Si `tpv_habilitado` entrara ahí, cualquier tenant podría activarse
 * el TPV — y con él la facturación y el registro de jornada — con una petición
 * hecha a mano. Solo el esquema del superadmin puede aceptarlo.
 */
describe('tpv_habilitado — solo lo cambia el superadmin', () => {
  it('el esquema del admin de tenant lo DESCARTA', () => {
    const r = updateEmpresaSchema.safeParse({ tpv_habilitado: true });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('tpv_habilitado');
  });

  it('el esquema del superadmin lo acepta', () => {
    const r = superadminUpdateEmpresaSchema.safeParse({ tpv_habilitado: false });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ tpv_habilitado: false });
  });

  it('el esquema del superadmin rechaza un valor que no sea booleano', () => {
    expect(superadminUpdateEmpresaSchema.safeParse({ tpv_habilitado: 'si' }).success).toBe(false);
  });
});
