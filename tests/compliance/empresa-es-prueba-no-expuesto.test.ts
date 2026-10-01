import { describe, it, expect } from 'vitest';
import { updateEmpresaSchema, superadminUpdateEmpresaSchema } from '@/core/application/dtos/empresa.dto';

/**
 * `empresas.es_prueba` habilita `reset_empresa_prueba()`, que borra pedidos,
 * cobros, turnos y clientes. Si cualquier esquema de la API lo aceptara, un
 * tenant real podría marcarse como prueba y borrar sus registros fiscales
 * (Art.66 LGT). La BD ya lo hace inmutable; esto cierra la puerta también en
 * la capa de aplicación: NINGÚN esquema lo deja pasar, ni el del superadmin.
 */
describe('empresas.es_prueba — nunca entra por la API', () => {
  it('el esquema del admin de tenant lo DESCARTA', () => {
    const r = updateEmpresaSchema.safeParse({ es_prueba: true });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('es_prueba');
  });

  it('el esquema del superadmin también lo DESCARTA', () => {
    const r = superadminUpdateEmpresaSchema.safeParse({ es_prueba: true });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty('es_prueba');
  });
});
