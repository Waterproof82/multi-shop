/**
 * Editar la dirección después de elegir una sugerencia de Mapbox la invalida.
 *
 * Bug real: el texto del buscador vive en `MapboxAddressInput`, pero la
 * dirección validada (y sus coordenadas) en el carrito. Al seguir escribiendo
 * tras elegir una sugerencia —p. ej. añadir ", Puerta 501"— el carrito no se
 * enteraba: el botón seguía habilitado y el pedido salía con la dirección
 * ANTERIOR mientras el cliente veía otra. En restaurante además se borraba la
 * tarifa en pantalla pero el carrito conservaba la vieja.
 *
 * Ahora cualquier edición borra la dirección del carrito y el botón no se
 * habilita hasta que se elige otra sugerencia.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CartDrawer } from '@/components/cart-drawer';
import { CartProvider, useCart } from '@/lib/cart-context';
import { LanguageProvider } from '@/lib/language-context';
import type { MenuItemVM } from '@/core/application/dtos/menu-view-model';
import type { ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

type Seleccion = { address: string; latitude: number; longitude: number; postalCode: string };

// Buscador sustituido: un botón que "elige la sugerencia" y un input que
// simula seguir escribiendo en el mismo campo.
vi.mock('@/components/MapboxAddressInput', () => ({
  MapboxAddressInput: ({ onSelect, onInputChange }: { onSelect: (a: Seleccion) => void; onInputChange?: (v: string) => void }) => (
    <>
      <button type="button" onClick={() => onSelect({ address: 'Calle Mayor 1, 38356 Tacoronte, España', latitude: 28.5, longitude: -16.4, postalCode: '38356' })}>
        elegir-direccion
      </button>
      <input aria-label="buscador" onChange={(e) => onInputChange?.(e.target.value)} />
    </>
  ),
}));

const ITEM: MenuItemVM = { id: 'prod-1', name: 'Producto de prueba', price: 10, category: 'cat-1' };
const DOMICILIO: ModalidadEntregaPublica = {
  id: '11111111-1111-4111-8111-111111111111', tipo: 'domicilio', icono: '🚲', nombre: 'Envío exprés', precioCents: 150,
  tiempoMinMinutos: null, tiempoMaxMinutos: null, activo: true, orden: 0,
};

function SembrarCarritoAbierto({ children }: Readonly<{ children: ReactNode }>) {
  const { addItem, openCart } = useCart();
  useEffect(() => {
    addItem(ITEM, 1);
    openCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}

function pintar(props: Partial<React.ComponentProps<typeof CartDrawer>>) {
  render(
    <LanguageProvider>
      <CartProvider>
        <SembrarCarritoAbierto>
          <CartDrawer {...props} />
        </SembrarCarritoAbierto>
      </CartProvider>
    </LanguageProvider>
  );
}

function rellenarDatos() {
  const escribir = (sel: string, v: string) => fireEvent.change(document.querySelector(sel) as HTMLElement, { target: { value: v } });
  escribir('#cart-nombre', 'Ana');
  escribir('#cart-telefono', '600123123');
  escribir('#cart-email', 'ana@example.com');
  fireEvent.click(screen.getByLabelText(/14 años/));
}

const boton = () => screen.getByRole('button', { name: 'Enviar Pedido' });
const seguirEscribiendo = (texto: string) => fireEvent.change(screen.getByLabelText('buscador'), { target: { value: texto } });

afterEach(() => vi.unstubAllGlobals());

describe('tienda — editar la dirección tras elegirla', () => {
  function prepararTienda() {
    pintar({ isRestaurant: false, envioDomicilioHabilitado: true, modalidadesEntrega: [DOMICILIO] });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    rellenarDatos();
    fireEvent.click(screen.getByRole('button', { name: /envío exprés/i }));
    fireEvent.click(screen.getByRole('button', { name: 'elegir-direccion' }));
  }

  it('con la sugerencia elegida el botón se habilita', () => {
    prepararTienda();
    expect(boton()).toBeEnabled();
  });

  it('seguir escribiendo deshabilita el botón y pide elegir una dirección válida', () => {
    prepararTienda();
    seguirEscribiendo('Calle Mayor 1, 38356 Tacoronte, España, Puerta 501');

    expect(boton()).toBeDisabled();
    expect(screen.getByText('Selecciona una dirección válida')).toBeInTheDocument();
  });

  it('volver a elegir una sugerencia lo habilita otra vez', () => {
    prepararTienda();
    seguirEscribiendo('Calle Mayor 1, Puerta 501');
    fireEvent.click(screen.getByRole('button', { name: 'elegir-direccion' }));

    expect(boton()).toBeEnabled();
  });
});

describe('restaurante — editar la dirección tras calcular la tarifa', () => {
  async function prepararRestaurante() {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ estimatedDeliveryFeeCents: 390 }), { status: 200 })));
    pintar({ isRestaurant: true, deliveryHabilitado: true, pagosPickupHabilitados: true });
    rellenarDatos();
    fireEvent.click(screen.getByRole('button', { name: /entrega a domicilio/i }));
    fireEvent.click(screen.getByRole('button', { name: 'elegir-direccion' }));
    fireEvent.click(screen.getByRole('button', { name: /ver tarifa de envío/i }));
    await waitFor(() => expect(boton()).toBeEnabled());
  }

  it('seguir escribiendo deshabilita el botón: la tarifa y la dirección ya no valen', async () => {
    await prepararRestaurante();
    seguirEscribiendo('Calle Mayor 1, Puerta 501');

    expect(boton()).toBeDisabled();
  });
});
