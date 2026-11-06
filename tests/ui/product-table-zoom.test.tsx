/**
 * La miniatura de una fila de la tabla de información es pulsable y abre el
 * MISMO zoom de foto que la carta y el carrito (`ImageZoomDialog`). El pie de
 * foto es la primera celda con texto de la fila; las filas sin imagen no
 * ofrecen botón.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProductTable } from '@/components/producto/product-table';
import { LanguageProvider } from '@/lib/language-context';
import type { ProductoTablaVM, TablaFilaVM } from '@/core/application/dtos/menu-view-model';

const TABLA: ProductoTablaVM = {
  columnas: [{ es: 'Modelo' }, { es: 'Capacidad' }],
  filas: [
    {
      celdas: [{ es: 'ES290' }, { es: '25Ah' }],
      imagen: 'https://imagenes.example/es290.webp',
    },
    { celdas: [{ es: 'ES300' }, { es: '30Ah' }] },
  ],
};

function pintar(tabla: ProductoTablaVM) {
  return render(
    <LanguageProvider>
      <ProductTable table={tabla} language="es" />
    </LanguageProvider>
  );
}

describe('ProductTable — zoom de la imagen de una fila', () => {
  it('pulsar la miniatura abre el zoom con la primera celda como pie de foto', () => {
    pintar(TABLA);

    // Desktop y móvil renderizan la miniatura (una se oculta por CSS).
    const miniaturas = screen.getAllByRole('button', { name: 'Ver imagen ampliada: ES290' });
    fireEvent.click(miniaturas[0]);

    const zoom = screen.getByRole('dialog', { name: 'ES290' });
    expect(within(zoom).getByRole('img', { name: 'ES290' })).toBeInTheDocument();
  });

  it('una fila sin imagen no ofrece zoom', () => {
    pintar(TABLA);

    expect(screen.queryByRole('button', { name: 'Ver imagen ampliada: ES300' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Ver imagen ampliada/ })).toHaveLength(2);
  });

  it('tolera filas con el shape legacy (array de celdas) sin romper', () => {
    const legacy: ProductoTablaVM = {
      columnas: TABLA.columnas,
      filas: [[{ es: 'ES400' }, { es: '40Ah' }]] as unknown as TablaFilaVM[],
    };

    pintar(legacy);

    expect(screen.getAllByText('ES400').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Ver imagen ampliada/ })).toBeNull();
  });
});
