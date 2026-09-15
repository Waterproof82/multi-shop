import { useState, type ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
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
const recogidaProgramada: ModalidadEntregaPublica = {
  id: 'r2',
  tipo: 'recogida',
  icono: 'clock',
  nombre: 'Recogida programada',
  precioCents: 0,
  tiempoMinMinutos: null,
  tiempoMaxMinutos: null,
  activo: true,
  orden: 1,
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
function renderSelector(
  propsOrNode: Readonly<Parameters<typeof TiendaFulfillmentSelector>[0]> | ReactElement,
  isNode = false
) {
  const children = isNode
    ? (propsOrNode as ReactElement)
    : <TiendaFulfillmentSelector {...(propsOrNode as Readonly<Parameters<typeof TiendaFulfillmentSelector>[0]>)} />;
  return render(<LanguageProvider>{children}</LanguageProvider>);
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

  it('resalta la primera modalidad automáticamente cuando el tab tiene una sola opción', () => {
    renderSelector({
      recogidaHabilitada: false,
      envioHabilitado: true,
      modalidades: [domicilio],
      value: 'domicilio',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const boton = within(lista).getByRole('button');
    expect(boton.className).toContain('border-primary');
  });

  it('resalta la primera modalidad del tab activo al cambiar de tab con múltiples opciones', () => {
    const domicilioExpres = { ...domicilio, id: 'd2', nombre: 'Envío exprés', precioCents: 500 };
    renderSelector({
      recogidaHabilitada: false,
      envioHabilitado: true,
      modalidades: [domicilio, domicilioExpres],
      value: 'domicilio',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(botones[0].className).toContain('border-primary');
    expect(botones[1].className).not.toContain('border-primary');
  });

  it('resalta la primera modalidad del tab nuevo (no una modalidad obsoleta del tab anterior) al cambiar de tab tras una selección manual', () => {
    // Wrapper controlado: refleja lo que hace el padre real (Task 14) —
    // `value` vive afuera y se actualiza con lo que onChange le informe.
    // Reproduce el escenario exacto del bug: click en un item NO default de
    // un tab, después cambiar de tab, y verificar que se resalta el primero
    // del tab nuevo — no un id obsoleto del tab anterior que no matchea
    // ninguna fila del tab nuevo.
    function Wrapper() {
      const [value, setValue] = useState<'recogida' | 'domicilio' | null>('recogida');
      return (
        <TiendaFulfillmentSelector
          recogidaHabilitada
          envioHabilitado
          modalidades={[recogida, recogidaProgramada, domicilio]}
          value={value}
          onChange={(tipo) => setValue(tipo)}
          onAddressSelect={vi.fn()}
        />
      );
    }
    renderSelector(<Wrapper />, true);

    const listaRecogida = screen.getByRole('list');
    fireEvent.click(within(listaRecogida).getAllByRole('button')[1]); // selecciona "Recogida programada", no la default

    fireEvent.click(screen.getByRole('tab', { name: /domicilio/i }));

    const listaDomicilio = screen.getByRole('list');
    const botonDomicilio = within(listaDomicilio).getByRole('button');
    expect(botonDomicilio.className).toContain('border-primary');
  });

  it('muestra el ícono de cada modalidad de domicilio', () => {
    renderSelector({
      recogidaHabilitada: false,
      envioHabilitado: true,
      modalidades: [domicilio],
      value: 'domicilio',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.getByText('🚲')).toBeInTheDocument();
  });

  it('recogida con una sola modalidad activa: línea fija sin botón, sin precio', () => {
    renderSelector({
      recogidaHabilitada: true,
      envioHabilitado: false,
      modalidades: [recogida],
      value: 'recogida',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText('Gratis')).toBeInTheDocument();
    expect(screen.queryByText('0,00 €')).not.toBeInTheDocument();
  });

  it('recogida con dos o más modalidades activas: lista clickeable, cada fila dice Gratis', () => {
    const recogidaProgramada2 = { ...recogidaProgramada, precioCents: 0 };
    renderSelector({
      recogidaHabilitada: true,
      envioHabilitado: false,
      modalidades: [recogida, recogidaProgramada2],
      value: 'recogida',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(botones).toHaveLength(2);
    expect(within(lista).getAllByText('Gratis')).toHaveLength(2);
  });
});
