/**
 * EstadoKitPublico — componente de servidor que pinta /kit/{serie} (sdd
 * kit-expiry-m2a, M2a3, docs/sdd/kit-expiry-reminders/m2a/spec.md R-M2a.2).
 *
 * Sin mocks de red: es puro de servidor, solo recibe `estado` ya resuelto
 * por el cargador (M2a4). El test de ACCESIBILIDAD (getByRole) importa más
 * que el de maquetación — un lector de pantalla no ve el color del texto.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EstadoKitPublico } from '@/components/kit-publico/estado-kit-publico';
import { URL_LISTA_MOCHILA, urlPackRecambio } from '@/lib/kit-caducidad/etiqueta-urls';
import type { EstadoKitPublico as EstadoKitPublicoVM } from '@/core/domain/entities/kit-caducidad-types';

function estado(overrides: Partial<EstadoKitPublicoVM> = {}): EstadoKitPublicoVM {
  return {
    serie: 'KEC-ABCD-1234-5',
    kitNombre: 'Kit Estándar 72h',
    general: 'al_dia',
    elementos: [],
    enlaces: { lista: URL_LISTA_MOCHILA, recambio: urlPackRecambio('kit-estandar-72h') },
    ...overrides,
  };
}

// R-M2a.2.7: nunca urgencia falsa ni respaldo oficial (términos de editorial.ts).
const TERMINOS_VETADOS = [
  'inminente',
  'cuenta atrás',
  'antes de que sea tarde',
  'solo hoy',
  'no esperes más',
  'en cualquier momento',
  'pánico',
  'recomendado por protección civil',
];

describe('EstadoKitPublico — al_dia', () => {
  it('pinta el nombre del kit como h1, el estado y la serie', () => {
    render(<EstadoKitPublico estado={estado()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Kit Estándar 72h' })).toBeInTheDocument();
    expect(screen.getByText('Todo al día')).toBeInTheDocument();
    expect(screen.getByText(/KEC-ABCD-1234-5/)).toBeInTheDocument();
  });

  it('la acción principal es la lista de la mochila, con su href exacto', () => {
    render(<EstadoKitPublico estado={estado()} />);

    const principal = screen.getByRole('link', { name: 'Revisa la lista de tu mochila' });
    expect(principal).toHaveAttribute('href', URL_LISTA_MOCHILA);
  });

  it('el recambio aparece como enlace secundario', () => {
    const vm = estado();
    render(<EstadoKitPublico estado={vm} />);

    const enlaces = screen.getAllByRole('link');
    expect(enlaces.some((a) => a.getAttribute('href') === vm.enlaces.recambio)).toBe(true);
  });
});

describe('EstadoKitPublico — caducado, botiquín con dos partes', () => {
  function estadoCaducado(): EstadoKitPublicoVM {
    return estado({
      general: 'caducado',
      elementos: [
        { consumible: 'Botiquín', parte: 'Gasas estériles', caducaEl: '2031-03-01', diasRestantes: -5, estado: 'caducado' },
        { consumible: 'Botiquín', parte: 'Tiritas', caducaEl: '2031-06-01', diasRestantes: 90, estado: 'al_dia' },
      ],
    });
  }

  it('una fila (listitem) por parte del botiquín, con su etiqueta', () => {
    render(<EstadoKitPublico estado={estadoCaducado()} />);

    const filas = screen.getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(screen.getByText('Botiquín — Gasas estériles')).toBeInTheDocument();
    expect(screen.getByText('Botiquín — Tiritas')).toBeInTheDocument();
  });

  it('cada fila muestra el estado en texto y la fecha en formato largo es-ES', () => {
    render(<EstadoKitPublico estado={estadoCaducado()} />);

    expect(screen.getByText('Caducado')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
    expect(screen.getByText('1 de marzo de 2031')).toBeInTheDocument();
    expect(screen.getByText('1 de junio de 2031')).toBeInTheDocument();
  });

  it('la acción principal es el recambio, con ?kit= en el href', () => {
    const vm = estadoCaducado();
    render(<EstadoKitPublico estado={vm} />);

    const principal = screen.getAllByRole('link')[0];
    expect(principal).toHaveAttribute('href', vm.enlaces.recambio);
    expect(principal.getAttribute('href')).toContain('?kit=');
  });
});

describe('EstadoKitPublico — sin_datos', () => {
  it('avisa de que aún no hay fechas y no pinta ninguna fila', () => {
    render(<EstadoKitPublico estado={estado({ general: 'sin_datos', elementos: [] })} />);

    expect(screen.getByText('Aún no tenemos las fechas de este kit')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});

describe('EstadoKitPublico — copy (marca y límites legales)', () => {
  it('no promete avisos (ningún "avis…") en ningún estado', () => {
    for (const general of ['al_dia', 'caduca_pronto', 'caducado', 'sin_datos'] as const) {
      const { unmount, container } = render(<EstadoKitPublico estado={estado({ general })} />);
      expect(container.textContent ?? '').not.toMatch(/avis/i);
      unmount();
    }
  });

  it('no usa ninguno de los términos vetados de urgencia falsa o respaldo oficial', () => {
    const { container } = render(<EstadoKitPublico estado={estado({ general: 'caducado' })} />);
    const texto = (container.textContent ?? '').toLowerCase();
    for (const termino of TERMINOS_VETADOS) {
      expect(texto).not.toContain(termino);
    }
  });

  it('los dos enlaces cumplen el objetivo táctil mínimo (44px, clase min-h-11)', () => {
    render(<EstadoKitPublico estado={estado()} />);

    for (const enlace of screen.getAllByRole('link')) {
      expect(enlace).toHaveClass('min-h-11');
    }
  });
});
