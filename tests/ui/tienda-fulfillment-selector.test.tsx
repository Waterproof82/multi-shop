import { useState, type ReactElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TiendaFulfillmentSelector, debeMostrarSelector, type ModalidadEntregaPublica } from '@/components/TiendaFulfillmentSelector';

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
const domicilioExpres: ModalidadEntregaPublica = {
  id: 'd2',
  tipo: 'domicilio',
  icono: 'car',
  nombre: 'Envío exprés',
  precioCents: 500,
  tiempoMinMinutos: 30,
  tiempoMaxMinutos: 45,
  activo: true,
  orden: 1,
};

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
  it('false si envioHabilitado está apagado', () => {
    expect(debeMostrarSelector(false, [domicilio])).toBe(false);
  });

  it('false si envioHabilitado está prendido pero no hay ninguna modalidad de domicilio activa', () => {
    expect(debeMostrarSelector(true, [{ ...domicilio, activo: false }])).toBe(false);
  });

  it('true si envioHabilitado está prendido y hay al menos una modalidad activa', () => {
    expect(debeMostrarSelector(true, [domicilio])).toBe(true);
  });
});

describe('TiendaFulfillmentSelector', () => {
  it('no renderiza nada si envioHabilitado es false', () => {
    renderSelector({
      envioHabilitado: false,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('no renderiza nada si envioHabilitado es true pero no hay modalidades de domicilio activas', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [{ ...domicilio, activo: false }],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('con domicilio habilitado, "Recoger en local" aparece primero en la lista', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(botones).toHaveLength(2);
    expect(within(botones[0]).getByText(/recoger en local/i)).toBeInTheDocument();
    expect(within(botones[1]).getByText('Envío')).toBeInTheDocument();
  });

  it('"Recoger en local" está preseleccionada por defecto (value null)', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(botones[0].className).toContain('border-primary');
    expect(botones[1].className).not.toContain('border-primary');
  });

  it('"Recoger en local" no muestra precio, dice Gratis', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    expect(within(botones[0]).getByText('Gratis')).toBeInTheDocument();
  });

  it('elegir una modalidad de domicilio la selecciona, dispara onChange y muestra el input de dirección', () => {
    const onChange = vi.fn();
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange,
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    fireEvent.click(botones[1]);
    expect(onChange).toHaveBeenCalledWith('domicilio', 'd1', 350);
    expect(screen.getByPlaceholderText(/dirección/i)).toBeInTheDocument();
  });

  it('volver a click en "Recoger en local" dispara onChange con id null y precio 0', () => {
    const onChange = vi.fn();
    function Wrapper() {
      const [value, setValue] = useState<'recogida' | 'domicilio' | null>('domicilio');
      return (
        <TiendaFulfillmentSelector
          envioHabilitado
          modalidades={[domicilio]}
          value={value}
          onChange={(tipo, id, precioCents) => {
            onChange(tipo, id, precioCents);
            setValue(tipo);
          }}
          onAddressSelect={vi.fn()}
        />
      );
    }
    renderSelector(<Wrapper />, true);

    const lista = screen.getByRole('list');
    fireEvent.click(within(lista).getAllByRole('button')[0]);

    expect(onChange).toHaveBeenCalledWith('recogida', null, 0);
    expect(screen.queryByPlaceholderText(/dirección/i)).not.toBeInTheDocument();
  });

  it('muestra el ícono de cada modalidad de domicilio', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.getByText('🚲')).toBeInTheDocument();
  });

  it('muestra el precio y el rango de tiempo de cada modalidad de domicilio', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio],
      value: null,
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    expect(screen.getByText(/3,50/)).toBeInTheDocument();
    expect(screen.getByText(/120-180/)).toBeInTheDocument();
  });

  it('con varias modalidades de domicilio, elegir la segunda la resalta y no a la primera', () => {
    renderSelector({
      envioHabilitado: true,
      modalidades: [domicilio, domicilioExpres],
      value: 'domicilio',
      onChange: vi.fn(),
      onAddressSelect: vi.fn(),
    });
    const lista = screen.getByRole('list');
    const botones = within(lista).getAllByRole('button');
    // botones[0] = "Recoger en local", botones[1] = domicilio, botones[2] = domicilioExpres
    fireEvent.click(botones[2]);
    expect(botones[2].className).toContain('border-primary');
    expect(botones[1].className).not.toContain('border-primary');
  });
});
