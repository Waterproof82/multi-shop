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

describe('PrivacidadContenido — encargado y derechos', () => {
  it('identifica al encargado del tratamiento actual', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    // Párrafo introductorio + fila de la tabla: dos apariciones a propósito.
    expect(screen.getAllByText('José Miguel Aristía Gordillo (Digitalizatenerife)').length).toBeGreaterThan(0);
    expect(screen.getByText('02670352Y')).toBeInTheDocument();
    expect(screen.queryByText(/Alan Cuadrado|DOC PC/)).not.toBeInTheDocument();
  });

  it('incluye el derecho a no ser objeto de decisiones automatizadas (art. 22)', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText('Decisiones automatizadas (Art. 22)')).toBeInTheDocument();
  });

  it('explica cómo ejercer los derechos sin exigir copia del DNI', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.getByRole('heading', { name: /cómo ejercer sus derechos/i })).toBeInTheDocument();
    expect(screen.queryByText(/copia del DNI/i)).not.toBeInTheDocument();
  });

  it('con TPV: 5 años y conservación de las ventas como obligación fiscal', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba({ flags: { tpvHabilitado: true } })} />);
    expect(screen.getByText('5 años sin actividad')).toBeInTheDocument();
    expect(screen.getByText('Obligaciones fiscales y contables')).toBeInTheDocument();
  });

  it('sin TPV: 3 años y sin finalidad fiscal (factura un programa externo)', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba({ flags: { tpvHabilitado: false } })} />);
    expect(screen.getByText('3 años sin actividad')).toBeInTheDocument();
    expect(screen.queryByText('Obligaciones fiscales y contables')).not.toBeInTheDocument();
  });

  it('informa de las copias de seguridad y de que los datos suprimidos quedan bloqueados en ellas', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText(/copias de seguridad diarias cifradas/i)).toBeInTheDocument();
    expect(screen.getByText(/bloqueados/i)).toBeInTheDocument();
  });

  it('informa de seguridad, brechas y cambios de la política', () => {
    render(<PrivacidadContenido ctx={contextoDePrueba()} />);
    expect(screen.getByRole('heading', { name: /seguridad de los datos/i })).toBeInTheDocument();
    expect(screen.getByText(/violación de seguridad/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /cambios en esta política/i })).toBeInTheDocument();
  });
});
