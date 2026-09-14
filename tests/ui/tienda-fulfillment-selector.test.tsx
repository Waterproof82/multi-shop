import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TiendaFulfillmentSelector, debeMostrarSelector, type ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

const recogida: ModalidadEntregaPublica = {
  id: 'r1',
  tipo: 'recogida',
  icono: 'store',
  nombre: 'Recogida',
  precioCents: 0,
  tiempoMinMinutos: null,
  tiempoMaxMinutos: null,
  activo: true,
  orden: 0,
};
const domicilio: ModalidadEntregaPublica = {
  id: 'd1',
  tipo: 'domicilio',
  icono: 'bike',
  nombre: 'Envío',
  precioCents: 350,
  tiempoMinMinutos: 120,
  tiempoMaxMinutos: 180,
  activo: true,
  orden: 0,
};

// El componente usa useLanguage() (formatPrice necesita el idioma), así que
// necesita LanguageProvider como wrapper — el snippet original del plan
// renderizaba sin él y hubiese lanzado "useLanguage must be used within
// LanguageProvider" antes de llegar a ninguna aserción.
function renderSelector(props: Readonly<Parameters<typeof TiendaFulfillmentSelector>[0]>) {
  return render(
    <LanguageProvider>
      <TiendaFulfillmentSelector {...props} />
    </LanguageProvider>
  );
}

describe('debeMostrarSelector', () => {
  it('false si ambos toggles están apagados', () => {
    expect(debeMostrarSelector(false, false, [recogida, domicilio])).toBe(false);
  });

  it('false si el toggle está prendido pero no hay ninguna modalidad activa de ese tipo', () => {
    expect(debeMostrarSelector(true, false, [{ ...recogida, activo: false }])).toBe(false);
  });

  it('true si al menos un tipo tiene toggle prendido Y una modalidad activa', () => {
    expect(debeMostrarSelector(true, false, [recogida])).toBe(true);
  });
});

describe('TiendaFulfillmentSelector', () => {
  it('no renderiza el tab de domicilio si envioHabilitado es false', () => {
    renderSelector({
      recogidaHabilitada: true,
      envioHabilitado: false,
      modalidades: [recogida, domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.queryByRole('tab', { name: /domicilio/i })).not.toBeInTheDocument();
  });

  it('muestra el precio y el rango de tiempo de cada modalidad de domicilio', () => {
    renderSelector({
      recogidaHabilitada: false,
      envioHabilitado: true,
      modalidades: [domicilio],
      value: 'domicilio',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.getByText(/3,50/)).toBeInTheDocument();
    expect(screen.getByText(/120-180/)).toBeInTheDocument();
  });
});
