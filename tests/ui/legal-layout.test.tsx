import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TablaSimple } from '@/components/legal/legal-layout';

describe('TablaSimple', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza filas con contenido idéntico sin colisionar claves de React', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <TablaSimple
        cabeceras={['Producto', 'Garantía']}
        filas={[
          ['Batería AGM', '2 años'],
          ['Batería AGM', '2 años'],
        ]}
      />,
    );
    expect(screen.getAllByText('Batería AGM')).toHaveLength(2);
    expect(screen.getAllByText('2 años')).toHaveLength(2);
    const duplicateKeyWarning = consoleError.mock.calls.some((call) =>
      String(call[0]).includes('Encountered two children with the same key'),
    );
    expect(duplicateKeyWarning).toBe(false);
  });
});
