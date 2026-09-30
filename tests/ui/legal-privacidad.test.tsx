import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrivacidadContenido } from '@/components/legal/privacidad-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('PrivacidadContenido', () => {
  it('sin reparto no lista Glovo ni declara dirección', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.queryByText(/Glovo/)).not.toBeInTheDocument();
    expect(screen.queryByText('Datos de dirección:')).not.toBeInTheDocument();
  });

  it('con reparto lista Glovo y declara dirección', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba({ flags: { deliveryHabilitado: true } })} />);
    expect(screen.getByText('Glovo App S.L. (España)')).toBeInTheDocument();
    expect(screen.getByText('Datos de dirección:')).toBeInTheDocument();
  });

  it('muestra el titular resuelto', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText('Tienda de Prueba S.L.')).toBeInTheDocument();
  });
});
