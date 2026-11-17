import { describe, it, expect } from 'vitest';
import { isItemVisible } from '@/app/admin/(protected)/admin-sidebar';

// R-M4.1.3: el grupo «Kits» (y sus items) no aparece si
// empresas.kits_caducidad_habilitado es false o no existe para esa empresa.
const ITEM_KITS_LOTES = {
  href: '/admin/kits/lotes',
  labelKey: 'sidebarKitsLotes' as const,
  icon: () => null,
  requiresKits: true,
};

const BASE_CTX = {
  mostrarPromociones: false, mostrarTgtg: false, isRestaurant: false, deliveryHabilitado: false,
  isTienda: true, landingHabilitada: true, tpvHabilitado: false,
};

describe('isItemVisible — items de Kits', () => {
  it('se muestran con el módulo de kits habilitado', () => {
    expect(isItemVisible(ITEM_KITS_LOTES, { ...BASE_CTX, kitsHabilitado: true })).toBe(true);
  });

  it('NO se muestran con el módulo de kits desactivado', () => {
    expect(isItemVisible(ITEM_KITS_LOTES, { ...BASE_CTX, kitsHabilitado: false })).toBe(false);
  });

  it('no afectan a items que no requieren kits', () => {
    const ITEM_SETTINGS = { href: '/admin/configuracion', labelKey: 'sidebarSettings' as const, icon: () => null };
    expect(isItemVisible(ITEM_SETTINGS, { ...BASE_CTX, kitsHabilitado: false })).toBe(true);
  });
});
