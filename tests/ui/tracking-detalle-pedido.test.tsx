/**
 * La página de seguimiento muestra todo lo que el cliente necesita comprobar:
 * cómo y a dónde se entrega, si está pagado, el número de seguimiento del
 * envío y el total REAL cobrado (con envío y descuento), no uno recalculado.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TrackingPageClient } from '@/components/tracking-page-client';
import { LanguageProvider } from '@/lib/language-context';
import type { VistaSeguimiento } from '@/lib/tracking/vista-publica';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const TOKEN = '11111111-1111-4111-8111-111111111111';

const DOMICILIO_PAGADO: VistaSeguimiento = {
  numero_pedido: 42,
  estimated_minutes: null,
  estimated_ready_at: null,
  items: [{ nombre: 'Tarta', cantidad: 2, precio: 10, complementos: [{ nombre: 'Nata', precio: 1 }] }],
  tipo: 'tienda',
  estado: 'pendiente',
  glovo_status: null,
  delivery_fee_cents: null,
  mesa_id: null,
  mesa_numero: null,
  mesa_nombre: null,
  sesion_id: null,
  google_reviews_url: null,
  total: 24.7,
  payment_status: 'paid',
  origen: null,
  modalidad_entrega_tipo: 'domicilio',
  modalidad_entrega_nombre: 'SEUR 24h',
  modalidad_entrega_precio_cents: 490,
  direccion_entrega: 'Calle Medico Ernesto Castro 57, Puerta 501, 38356 Tacoronte',
  numero_seguimiento: 'ES123456',
  descuento_porcentaje: 10,
};

function pintar(status: VistaSeguimiento) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(status), { status: 200 })));
  render(
    <LanguageProvider>
      <TrackingPageClient token={TOKEN} initialStatus={status} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* sin storage */ }
});
afterEach(() => vi.unstubAllGlobals());

describe('Seguimiento — detalle del pedido', () => {
  it('tienda a domicilio pagada: entrega, dirección, pago, nº de seguimiento y descuento', async () => {
    pintar(DOMICILIO_PAGADO);

    await waitFor(() => expect(screen.getByText(/Envío a domicilio — SEUR 24h/)).toBeInTheDocument());
    expect(screen.getByText('Calle Medico Ernesto Castro 57, Puerta 501, 38356 Tacoronte')).toBeInTheDocument();
    expect(screen.getByText('Pagado online')).toBeInTheDocument();
    expect(screen.getByText('ES123456')).toBeInTheDocument();
    expect(screen.getByText(/Descuento/)).toBeInTheDocument();
  });

  it('el total es el cobrado, y los gastos de envío de tienda tienen su fila', async () => {
    pintar(DOMICILIO_PAGADO);

    await waitFor(() => expect(screen.getByText('24,70 €')).toBeInTheDocument());
    expect(screen.getByText('Gastos de envío')).toBeInTheDocument();
    expect(screen.getByText('4,90 €')).toBeInTheDocument();
    // La línea del producto incluye el complemento: (10 + 1) × 2.
    expect(screen.getByText('22,00 €')).toBeInTheDocument();
  });

  it('recogida sin pago online: dice recogida y no afirma nada del pago ni de dirección', async () => {
    pintar({
      ...DOMICILIO_PAGADO,
      modalidad_entrega_tipo: 'recogida',
      modalidad_entrega_nombre: null,
      modalidad_entrega_precio_cents: 0,
      direccion_entrega: null,
      payment_status: 'not_required',
      numero_seguimiento: null,
      descuento_porcentaje: null,
      total: 22,
    });

    await waitFor(() => expect(screen.getByText('Recogida en el local')).toBeInTheDocument());
    expect(screen.queryByText('Pagado online')).not.toBeInTheDocument();
    expect(screen.queryByText('Gastos de envío')).not.toBeInTheDocument();
    expect(screen.queryByText(/Dirección de entrega/)).not.toBeInTheDocument();
  });
});
