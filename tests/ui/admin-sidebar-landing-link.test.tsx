import { describe, it, expect } from 'vitest';
import { isItemVisible } from '@/app/admin/(protected)/admin-sidebar';

// Si el superadmin desactiva la landing de una empresa (landing_habilitada =
// false), "/" redirige directo a la carta: editar la landing no tiene efecto
// visible, así que el link "/admin/landing" no debe aparecer en el sidebar.
const ITEM_LANDING = {
  href: '/admin/landing',
  labelKey: 'sidebarLanding' as const,
  icon: () => null,
  requiresLanding: true,
};

const BASE_CTX = {
  mostrarPromociones: false, mostrarTgtg: false, isRestaurant: false, deliveryHabilitado: false, isTienda: true,
  tpvHabilitado: false,
};

describe('isItemVisible — link de landing en el sidebar', () => {
  it('se muestra con landingHabilitada=true', () => {
    expect(isItemVisible(ITEM_LANDING, { ...BASE_CTX, landingHabilitada: true })).toBe(true);
  });

  it('NO se muestra con landingHabilitada=false', () => {
    expect(isItemVisible(ITEM_LANDING, { ...BASE_CTX, landingHabilitada: false })).toBe(false);
  });

  it('no afecta a items que no requieren landing', () => {
    const ITEM_SETTINGS = { href: '/admin/configuracion', labelKey: 'sidebarSettings' as const, icon: () => null };
    expect(isItemVisible(ITEM_SETTINGS, { ...BASE_CTX, landingHabilitada: false })).toBe(true);
  });
});
