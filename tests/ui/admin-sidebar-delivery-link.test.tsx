import { describe, it, expect } from 'vitest';
import { isItemVisible } from '@/app/admin/(protected)/admin-sidebar';

// Bug real: el link "/admin/delivery" del sidebar solo se mostraba si
// deliveryHabilitado (el flag viejo, exclusivo de restaurante/Glovo) era
// true — nunca chequeaba si la empresa es tipo tienda. Como
// envio_domicilio_habilitado (el toggle nuevo) nace en false, el admin de
// una tienda nunca podía navegar a la página que lo enciende: el link ni
// aparecía en el sidebar.
const ITEM_DELIVERY = {
  href: '/admin/delivery',
  labelKey: 'sidebarDelivery' as const,
  icon: () => null,
  requiresDelivery: true,
};

describe('isItemVisible — link de delivery en el sidebar', () => {
  it('se muestra para restaurante con deliveryHabilitado=true', () => {
    expect(isItemVisible(ITEM_DELIVERY, {
      mostrarPromociones: false, mostrarTgtg: false, isRestaurant: true, deliveryHabilitado: true, isTienda: false,
    })).toBe(true);
  });

  it('NO se muestra para restaurante con deliveryHabilitado=false', () => {
    expect(isItemVisible(ITEM_DELIVERY, {
      mostrarPromociones: false, mostrarTgtg: false, isRestaurant: true, deliveryHabilitado: false, isTienda: false,
    })).toBe(false);
  });

  it('se muestra para tienda aunque deliveryHabilitado sea false — es la única puerta a los toggles de recogida/domicilio', () => {
    expect(isItemVisible(ITEM_DELIVERY, {
      mostrarPromociones: false, mostrarTgtg: false, isRestaurant: false, deliveryHabilitado: false, isTienda: true,
    })).toBe(true);
  });
});
