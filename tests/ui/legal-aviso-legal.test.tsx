import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoLegalContenido } from '@/components/legal/aviso-legal-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('AvisoLegalContenido', () => {
  it('pinta los datos del titular (art. 10 LSSI)', () => {
    render(<AvisoLegalContenido ctx={contextoDePrueba({ titular: { ...contextoDePrueba().titular, registroMercantil: 'RM Tenerife, tomo 2690' } })} />);
    expect(screen.getByText('Tienda de Prueba S.L.')).toBeInTheDocument();
    expect(screen.getByText('B00000000')).toBeInTheDocument();
    expect(screen.getByText('RM Tenerife, tomo 2690')).toBeInTheDocument();
  });

  it('omite el registro mercantil si no hay (autónomos)', () => {
    render(<AvisoLegalContenido ctx={contextoDePrueba()} />);
    expect(screen.queryByText('Registro Mercantil:')).not.toBeInTheDocument();
  });

  it('el texto adicional con HTML se muestra escapado', () => {
    render(<AvisoLegalContenido ctx={contextoDePrueba({ legal: { adicionalAvisoLegal: '<script>alert(1)</script>' } })} />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
