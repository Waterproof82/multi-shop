import { describe, it, expect } from 'vitest';
import { isItemVisible } from '@/app/admin/(protected)/admin-sidebar';

// sdd pet-id-qr-profile, Fase 7 — el item «Mascotas» (y su enlace) no
// aparece si empresas.pet_id_qr_habilitado es false o no existe para esa
// empresa (calco de `admin-sidebar-kits.test.tsx`, R-QR.13.1).
const ITEM_MASCOTAS = {
  href: '/admin/mascotas/lotes',
  labelKey: 'sidebarMascotas' as const,
  icon: () => null,
  requiresMascotas: true,
};

const BASE_CTX = {
  mostrarPromociones: false, mostrarTgtg: false, isRestaurant: false, deliveryHabilitado: false,
  isTienda: true, landingHabilitada: true, tpvHabilitado: false, kitsHabilitado: false,
};

describe('isItemVisible — item de Mascotas', () => {
  it('se muestra con el módulo de mascotas habilitado', () => {
    expect(isItemVisible(ITEM_MASCOTAS, { ...BASE_CTX, mascotasHabilitado: true })).toBe(true);
  });

  it('NO se muestra con el módulo de mascotas desactivado', () => {
    expect(isItemVisible(ITEM_MASCOTAS, { ...BASE_CTX, mascotasHabilitado: false })).toBe(false);
  });

  it('no afecta a items que no requieren mascotas', () => {
    const ITEM_SETTINGS = { href: '/admin/configuracion', labelKey: 'sidebarSettings' as const, icon: () => null };
    expect(isItemVisible(ITEM_SETTINGS, { ...BASE_CTX, mascotasHabilitado: false })).toBe(true);
  });
});
