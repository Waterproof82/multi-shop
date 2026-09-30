import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnviosContenido } from '@/components/legal/envios-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('EnviosContenido', () => {
  it('genera la tabla desde las modalidades de domicilio', () => {
    render(<EnviosContenido ctx={contextoDePrueba({
      modalidadesDomicilio: [
        { nombre: 'Tenerife', precioCents: 1500, tiempoMin: 24, tiempoMax: 48 },
        { nombre: 'Las Palmas', precioCents: 2500, tiempoMin: 48, tiempoMax: 48 },
      ],
    })} />);
    expect(screen.getByText('Tenerife')).toBeInTheDocument();
    expect(screen.getByText(/15,00/)).toBeInTheDocument();
    expect(screen.getByText('24-48 h')).toBeInTheDocument();
    expect(screen.getByText('48 h')).toBeInTheDocument();
  });

  it('sin modalidades explica que se informa en el carrito', () => {
    render(<EnviosContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText(/se muestran en el carrito/i)).toBeInTheDocument();
  });

  it('muestra plazo de preparación y aviso de daños si están configurados', () => {
    render(<EnviosContenido ctx={contextoDePrueba({ legal: { plazoPreparacionDias: 2, plazoAvisoDanosHoras: 24 } })} />);
    expect(screen.getByText(/2 días hábiles/)).toBeInTheDocument();
    expect(screen.getByText(/24 horas/)).toBeInTheDocument();
  });
});
