import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CondicionesContenido } from '@/components/legal/condiciones-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('CondicionesContenido', () => {
  it('restaurante: informa de que no hay desistimiento por perecederos (art. 97.1.n)', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipo: 'restaurante' })} />);
    expect(screen.getByText(/no es aplicable el derecho de desistimiento/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /devoluciones/i })).not.toBeInTheDocument();
  });

  it('restaurante con reparto: sección de reparto a domicilio', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipo: 'restaurante', flags: { deliveryHabilitado: true } })} />);
    expect(screen.getByRole('heading', { name: /reparto a domicilio/i })).toBeInTheDocument();
  });

  it('restaurante sin reparto: sin sección de reparto', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipo: 'restaurante' })} />);
    expect(screen.queryByRole('heading', { name: /reparto a domicilio/i })).not.toBeInTheDocument();
  });

  it('tienda: remite a la página de devoluciones', () => {
    render(<CondicionesContenido ctx={contextoDePrueba()} />);
    expect(screen.getByRole('link', { name: /devoluciones y garantía/i })).toHaveAttribute('href', '/devoluciones');
  });

  it('usa IGIC si la empresa tributa en Canarias', () => {
    render(<CondicionesContenido ctx={contextoDePrueba({ tipoImpuesto: 'igic' })} />);
    expect(screen.getByText(/IGIC/)).toBeInTheDocument();
    expect(screen.queryByText(/\bIVA\b/)).not.toBeInTheDocument();
  });

  it('menciona el pago con tarjeta solo si está activo', () => {
    const { unmount } = render(<CondicionesContenido ctx={contextoDePrueba()} />);
    expect(screen.queryByText(/tarjeta/i)).not.toBeInTheDocument();
    unmount();
    render(<CondicionesContenido ctx={contextoDePrueba({ flags: { pagoTarjetaActivo: true } })} />);
    expect(screen.getByText(/tarjeta/i)).toBeInTheDocument();
  });
});
