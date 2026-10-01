import { describe, it, expect } from 'vitest';
import { isItemVisible } from '@/app/admin/(protected)/admin-sidebar';

// Empleados TPV y registro de auditoría solo tienen sentido con el TPV
// contratado (empresas.tpv_habilitado, lo activa el superadmin), sea tienda o
// restaurante. Antes dependían de "restaurante con mesas".
const ITEM_EMPLEADOS = { href: '/admin/empleados-tpv', labelKey: 'sidebarEmpleadosTpv' as const, icon: () => null, requiresTpv: true };

const BASE_CTX = {
  mostrarPromociones: false, mostrarTgtg: false, isRestaurant: false, deliveryHabilitado: false,
  isTienda: true, landingHabilitada: true,
};

describe('isItemVisible — items del TPV', () => {
  it('se muestran en una tienda CON TPV', () => {
    expect(isItemVisible(ITEM_EMPLEADOS, { ...BASE_CTX, tpvHabilitado: true })).toBe(true);
  });

  it('NO se muestran en un restaurante SIN TPV', () => {
    expect(isItemVisible(ITEM_EMPLEADOS, { ...BASE_CTX, isTienda: false, isRestaurant: true, tpvHabilitado: false })).toBe(false);
  });

  it('no afectan a items que no requieren TPV', () => {
    const ITEM_SETTINGS = { href: '/admin/configuracion', labelKey: 'sidebarSettings' as const, icon: () => null };
    expect(isItemVisible(ITEM_SETTINGS, { ...BASE_CTX, tpvHabilitado: false })).toBe(true);
  });
});
