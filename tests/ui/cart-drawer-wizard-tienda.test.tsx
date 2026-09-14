/**
 * Wizard de 2 pasos del carrito, exclusivo de tienda con recogida/domicilio.
 *
 * `usaWizardTienda` es la UNICA puerta de entrada al comportamiento nuevo:
 * restaurante, mesa y waiter deben quedar bit a bit iguales a como estaban
 * antes de este cambio. Por eso el primer bloque prueba la funcion pura por
 * separado — es mas rapido de razonar que montar el componente entero para
 * cada combinacion — y el segundo bloque monta `CartDrawer` de verdad para
 * comprobar que el paso inicial y la transicion "Continuar" funcionan.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { CartDrawer, usaWizardTienda } from '@/components/cart-drawer';
import { CartProvider, useCart } from '@/lib/cart-context';
import { LanguageProvider } from '@/lib/language-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

// CartDrawer usa useRouter() para el redirect post-pedido — no aplica en
// estos tests (no se llega a confirmar ningun pedido), pero el hook exige
// un AppRouterContext montado o revienta al renderizar.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('usaWizardTienda', () => {
  it('false para restaurante, aunque tenga los toggles de tienda en true', () => {
    expect(usaWizardTienda(true, null, true, true)).toBe(false);
  });

  it('false en modo mesa', () => {
    expect(usaWizardTienda(false, 'mesa-token', true, true)).toBe(false);
  });

  it('false para tienda sin ningún toggle activo', () => {
    expect(usaWizardTienda(false, null, false, false)).toBe(false);
  });

  it('true para tienda con al menos un toggle activo, sin mesa', () => {
    expect(usaWizardTienda(false, null, true, false)).toBe(true);
  });
});

const ITEM_DE_PRUEBA: MenuItemVM = {
  id: 'prod-1',
  name: 'Producto de prueba',
  price: 10,
  category: 'cat-1',
};

/** Siembra el carrito con un item y lo abre antes de pintar `CartDrawer`. */
function SembrarCarritoAbierto({ children }: Readonly<{ children: ReactNode }>) {
  const { addItem, openCart } = useCart();
  useEffect(() => {
    addItem(ITEM_DE_PRUEBA, 1);
    openCart();
    // Solo al montar: sembrar el carrito una vez es lo que necesita el test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function pintarCartDrawerConItem(props: Partial<React.ComponentProps<typeof CartDrawer>> = {}) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <SembrarCarritoAbierto>
          <CartDrawer isRestaurant={false} recogidaTiendaHabilitada={true} {...props} />
        </SembrarCarritoAbierto>
      </CartProvider>
    </LanguageProvider>
  );
}

describe('CartDrawer — wizard de tienda (recogida/domicilio activo, sin mesa)', () => {
  it('arranca en el paso de items: se ve la lista y "Continuar", no los datos del cliente', () => {
    pintarCartDrawerConItem();

    expect(screen.getByText('Producto de prueba')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument();
    expect(document.querySelector('#cart-nombre')).toBeNull();
  });

  it('al pulsar "Continuar" pasa al paso de checkout: aparecen los datos del cliente y desaparece la lista', () => {
    pintarCartDrawerConItem();

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(document.querySelector('#cart-nombre')).not.toBeNull();
    expect(screen.queryByText('Producto de prueba')).not.toBeInTheDocument();
  });

  it('el total mostrado incluye el precio de la modalidad de entrega elegida', () => {
    // Item de prueba = 10,00 €. Modalidad con recargo de 1,50 € → total 11,50 €.
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm1',
        tipo: 'recogida',
        icono: '🏬',
        nombre: 'Recogida rápida',
        precioCents: 150,
        tiempoMinMinutos: null,
        tiempoMaxMinutos: null,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('tab', { name: /recoger en tienda/i }));

    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });

  it('desglosa el precio de la modalidad en su propia fila, no solo sumado al total', () => {
    // Bug real: computeCartTotals sumaba el precio de la modalidad dentro de
    // `deliveryFee`, pero la fila que lo mostraba (showDeliveryCostRow) solo
    // se activa con `isDelivery` — un concepto exclusivo del selector Glovo
    // de restaurante, que en tienda nunca se pone en true. El cargo quedaba
    // sumado al total sin ninguna línea que lo explicara.
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm1',
        tipo: 'recogida',
        icono: '🏬',
        nombre: 'Recogida rápida',
        precioCents: 150,
        tiempoMinMinutos: null,
        tiempoMaxMinutos: null,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('tab', { name: /recoger en tienda/i }));

    // Aparece dos veces: una en la fila de la lista de TiendaFulfillmentSelector
    // (la que ya existía) y otra nueva en el desglose de TotalsSection — si
    // solo apareciera una vez, la fila de desglose no se estaría pintando.
    expect(screen.getAllByText('Recogida rápida')).toHaveLength(2);
    expect(screen.getAllByText('1,50 €')).toHaveLength(2);
    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });
});
