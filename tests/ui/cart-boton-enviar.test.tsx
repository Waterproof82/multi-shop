/**
 * El botón "Enviar pedido" no se habilita hasta que están todos los datos
 * obligatorios: nombre, teléfono, email (cuando es obligatorio), método de
 * entrega elegido, dirección si es a domicilio y la casilla de edad.
 *
 * Antes solo se comprobaba al pulsar, así que el botón invitaba a enviar un
 * pedido que iba a fallar. Mientras falte algo, un texto dice por qué está
 * deshabilitado: un botón gris sin explicación deja al cliente atascado.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { CartDrawer } from '@/components/cart-drawer';
import { CartProvider, useCart } from '@/lib/cart-context';
import { LanguageProvider } from '@/lib/language-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const ITEM: MenuItemVM = { id: 'prod-1', name: 'Producto de prueba', price: 10, category: 'cat-1' };

const DOMICILIO: ModalidadEntregaPublica = {
  id: 'm1', tipo: 'domicilio', icono: '🚲', nombre: 'Envío exprés', precioCents: 150,
  tiempoMinMinutos: null, tiempoMaxMinutos: null, activo: true, orden: 0,
};

const AVISO = 'Completa los datos obligatorios para enviar el pedido.';

function SembrarCarritoAbierto({ children }: Readonly<{ children: ReactNode }>) {
  const { addItem, openCart } = useCart();
  useEffect(() => {
    addItem(ITEM, 1);
    openCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function pintar(props: Partial<React.ComponentProps<typeof CartDrawer>> = {}) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <SembrarCarritoAbierto>
          <CartDrawer isRestaurant={false} {...props} />
        </SembrarCarritoAbierto>
      </CartProvider>
    </LanguageProvider>
  );
}

const boton = () => screen.getByRole('button', { name: 'Enviar Pedido' });
const escribir = (selector: string, valor: string) =>
  fireEvent.change(document.querySelector(selector) as HTMLElement, { target: { value: valor } });

function rellenar({ email = 'ana@example.com' }: { email?: string } = {}) {
  escribir('#cart-nombre', 'Ana');
  escribir('#cart-telefono', '600123123');
  escribir('#cart-email', email);
  fireEvent.click(screen.getByLabelText(/14 años/));
}

describe('botón Enviar pedido — tienda sin envío a domicilio', () => {
  it('arranca deshabilitado y explica por qué', () => {
    pintar();
    expect(boton()).toBeDisabled();
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it('con todo relleno se habilita y el aviso desaparece', () => {
    pintar();
    rellenar();
    expect(boton()).toBeEnabled();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });

  it('sin email sigue deshabilitado: en tienda es obligatorio', () => {
    pintar();
    rellenar({ email: '' });
    expect(boton()).toBeDisabled();
  });

  it('con un email mal escrito sigue deshabilitado', () => {
    pintar();
    rellenar({ email: 'ana@' });
    expect(boton()).toBeDisabled();
  });

  it('un teléfono demasiado corto lo deja deshabilitado', () => {
    pintar();
    rellenar();
    escribir('#cart-telefono', '600');
    expect(boton()).toBeDisabled();
  });
});

describe('botón Enviar pedido — tienda con envío a domicilio', () => {
  const pintarWizard = () => {
    pintar({ envioDomicilioHabilitado: true, modalidadesEntrega: [DOMICILIO] });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
  };

  it('sin elegir recogida o domicilio sigue deshabilitado', () => {
    pintarWizard();
    rellenar();
    expect(boton()).toBeDisabled();
    expect(screen.getByText(AVISO)).toBeInTheDocument();
  });

  it('eligiendo recogida se habilita', () => {
    pintarWizard();
    rellenar();
    fireEvent.click(screen.getByRole('button', { name: /recoger en local/i }));
    expect(boton()).toBeEnabled();
  });

  it('eligiendo domicilio sin dirección sigue deshabilitado', () => {
    pintarWizard();
    rellenar();
    fireEvent.click(screen.getByRole('button', { name: /envío exprés/i }));
    expect(boton()).toBeDisabled();
  });
});

describe('botón Enviar pedido — restaurante sin pago online', () => {
  it('con delivery activado hay que elegir cómo se entrega', () => {
    pintar({ isRestaurant: true, deliveryHabilitado: true });
    rellenar({ email: '' });
    expect(boton()).toBeDisabled();
  });

  it('eligiendo recogida se habilita sin email: aquí es opcional', () => {
    // Sin delivery activado, DeliveryMethodSelector preselecciona recogida solo.
    pintar({ isRestaurant: true });
    rellenar({ email: '' });
    expect(boton()).toBeEnabled();
  });
});
