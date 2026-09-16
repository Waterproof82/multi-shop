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
  it('false para restaurante, aunque envioHabilitado sea true', () => {
    expect(usaWizardTienda(true, null, true)).toBe(false);
  });

  it('false en modo mesa', () => {
    expect(usaWizardTienda(false, 'mesa-token', true)).toBe(false);
  });

  it('false para tienda con envioHabilitado apagado', () => {
    expect(usaWizardTienda(false, null, false)).toBe(false);
  });

  it('true para tienda con envioHabilitado prendido, sin mesa', () => {
    expect(usaWizardTienda(false, null, true)).toBe(true);
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
          <CartDrawer isRestaurant={false} envioDomicilioHabilitado={true} {...props} />
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
        tipo: 'domicilio',
        icono: '🚲',
        nombre: 'Envío exprés',
        precioCents: 150,
        tiempoMinMinutos: 30,
        tiempoMaxMinutos: 45,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ envioDomicilioHabilitado: true, modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('button', { name: /envío exprés/i }));

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
        tipo: 'domicilio',
        icono: '🚲',
        nombre: 'Envío exprés',
        precioCents: 150,
        // null (no 30/45 como en el test anterior): con un rango de tiempo
        // no nulo, TiendaFulfillmentSelector concatena " · 30-45 min" al
        // precio en la fila de la lista ("1,50 € · 30-45 min"), lo que rompe
        // el match exacto de getAllByText('1,50 €') contra esa fila. La fila
        // de desglose de TotalsSection sí pinta el precio limpio siempre.
        tiempoMinMinutos: null,
        tiempoMaxMinutos: null,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ envioDomicilioHabilitado: true, modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('button', { name: /envío exprés/i }));

    // Aparece dos veces: una en la fila de la lista de TiendaFulfillmentSelector
    // (la que ya existía) y otra nueva en el desglose de TotalsSection — si
    // solo apareciera una vez, la fila de desglose no se estaría pintando.
    expect(screen.getAllByText('Envío exprés')).toHaveLength(2);
    expect(screen.getAllByText('1,50 €')).toHaveLength(2);
    expect(screen.getByText('11,50 €')).toBeInTheDocument();
  });

  // C1 (Task 18): un pedido de domicilio se podía confirmar sin dirección —
  // ni el cliente ni el servidor lo bloqueaban. Este bloque cubre el lado
  // cliente: gatear el submit reusando el mismo patrón de mensaje/deshabilitar
  // que ya existía para restaurante, sin duplicar UI nueva.
  it('deshabilita el botón de enviar si se elige domicilio y no se seleccionó dirección (sin lat/lng)', () => {
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm-domicilio',
        tipo: 'domicilio',
        icono: '🛵',
        nombre: 'Envío estándar',
        precioCents: 350,
        tiempoMinMinutos: 120,
        tiempoMaxMinutos: 180,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ envioDomicilioHabilitado: true, modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    // La confirmación de edad es una condición aparte (LOPDGDD Art.7) —
    // marcarla para aislar la condición que este test ejercita: la dirección
    // de domicilio, no la edad.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /envío estándar/i }));

    expect(screen.getByRole('button', { name: /enviar pedido/i })).toBeDisabled();
    expect(screen.getByText('Selecciona una dirección válida')).toBeInTheDocument();
  });

  it('NO bloquea el botón de enviar en recogida, aunque domicilio esté habilitado (el bloqueo es específico de domicilio)', () => {
    const modalidades: ModalidadEntregaPublica[] = [
      {
        id: 'm-recogida',
        tipo: 'recogida',
        icono: '🏬',
        nombre: 'Recogida rápida',
        precioCents: 0,
        tiempoMinMinutos: null,
        tiempoMaxMinutos: null,
        activo: true,
        orden: 0,
      },
      {
        id: 'm-domicilio',
        tipo: 'domicilio',
        icono: '🛵',
        nombre: 'Envío estándar',
        precioCents: 350,
        tiempoMinMinutos: 120,
        tiempoMaxMinutos: 180,
        activo: true,
        orden: 0,
      },
    ];
    pintarCartDrawerConItem({ envioDomicilioHabilitado: true, modalidadesEntrega: modalidades });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    fireEvent.click(screen.getByRole('checkbox'));
    // "Recoger en local" está preseleccionada por defecto — sin necesidad de
    // tocar nada del selector, el pedido ya está en recogida.

    expect(screen.getByRole('button', { name: /enviar pedido/i })).not.toBeDisabled();
    expect(screen.queryByText('Selecciona una dirección válida')).not.toBeInTheDocument();
  });
});
