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

/**
 * Mismo agujero, otros interruptores: el panel del tenant NUNCA los envía,
 * pero hasta el 2026-10-01 `/api/admin/empresa` los aceptaba. Un admin de
 * tenant podía convertir su tienda en restaurante o activarse Glovo, mesas o
 * cobros en mesa con una petición hecha a mano.
 */
describe('interruptores de producto — solo superadmin', () => {
  const SOLO_SUPERADMIN = {
    tipo: 'restaurante',
    delivery_habilitado: true,
    mesas_habilitadas: true,
    pagos_mesa_habilitados: true,
    pagos_pickup_habilitados: true,
    validacion_pedidos_habilitada: true,
  } as const;

  it.each(Object.entries(SOLO_SUPERADMIN))('el admin de tenant NO puede cambiar %s', (campo, valor) => {
    const r = updateEmpresaSchema.safeParse({ [campo]: valor });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty(campo);
  });

  it.each(Object.entries(SOLO_SUPERADMIN))('el superadmin sí puede cambiar %s', (campo, valor) => {
    expect(superadminUpdateEmpresaSchema.safeParse({ [campo]: valor }).data).toEqual({ [campo]: valor });
  });

  it('lo que el panel del tenant SÍ envía sigue aceptándose', () => {
    const r = updateEmpresaSchema.safeParse({
      envio_domicilio_habilitado: true, mostrar_promociones: false, mostrar_tgtg: true, descuento_bienvenida_activo: true,
    });
    expect(r.data).toEqual({ envio_domicilio_habilitado: true, mostrar_promociones: false, mostrar_tgtg: true, descuento_bienvenida_activo: true });
  });
});
