/**
 * not-found.tsx de /kit/[serie] — mensaje neutro único (sdd kit-expiry-m2a,
 * M2a4, R-M2a.1.4): invita a comprobar la serie de la etiqueta o a
 * reintentarlo en un minuto, y enlaza a la lista de la mochila. NO debe
 * delatar CUÁL de los casos de R-M2a.1.3 ocurrió (sin tenant, módulo
 * apagado, límite superado, serie inválida o desconocida) — así que el
 * texto no puede mencionar ninguno de ellos explícitamente.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NotFound from '@/app/kit/[serie]/not-found';
import { URL_LISTA_MOCHILA } from '@/lib/kit-caducidad/etiqueta-urls';

describe('KitPublicoNotFound', () => {
  it('pinta un mensaje neutro con heading y un enlace a la lista de la mochila', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const enlace = screen.getByRole('link');
    expect(enlace).toHaveAttribute('href', URL_LISTA_MOCHILA);
  });

  it('no delata cuál de los casos ocurrió: nada de "registrad", "no existe" ni "límite"', () => {
    const { container } = render(<NotFound />);
    const texto = (container.textContent ?? '').toLowerCase();

    expect(texto).not.toContain('registrad');
    expect(texto).not.toContain('no existe');
    expect(texto).not.toContain('límite');
  });
});
