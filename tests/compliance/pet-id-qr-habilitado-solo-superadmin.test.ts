import { describe, it, expect } from 'vitest';
import { updateEmpresaSchema, superadminUpdateEmpresaSchema } from '@/core/application/dtos/empresa.dto';

/**
 * Mismo agujero que `kits_caducidad_habilitado` (ver
 * kits-caducidad-habilitado-solo-superadmin.test.ts): `updateEmpresaSchema`
 * lo usa también `/api/admin/empresa` (el admin de cada tenant). Si
 * `pet_id_qr_habilitado` entrara ahí, cualquier admin de tienda podría
 * activarse el módulo de chapas QR de mascotas con una petición hecha a mano.
 */
describe('pet_id_qr_habilitado — solo lo cambia el superadmin', () => {
  it('el esquema del admin de tenant lo DESCARTA', () => {
    const r = updateEmpresaSchema.safeParse({ pet_id_qr_habilitado: true });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('pet_id_qr_habilitado');
  });

  it('el esquema del superadmin lo acepta', () => {
    const r = superadminUpdateEmpresaSchema.safeParse({ pet_id_qr_habilitado: true });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ pet_id_qr_habilitado: true });
  });

  it('el esquema del superadmin rechaza un valor que no sea booleano', () => {
    expect(superadminUpdateEmpresaSchema.safeParse({ pet_id_qr_habilitado: 'si' }).success).toBe(false);
  });
});
