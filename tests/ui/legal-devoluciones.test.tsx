import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DevolucionesContenido } from '@/components/legal/devoluciones-contenido';
import { contextoDePrueba } from './legal-fixtures';

describe('DevolucionesContenido', () => {
  it('por defecto: 14 días, reembolso en 14 días y 3 años de garantía', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText(/14 días naturales/)).toBeInTheDocument();
    expect(screen.getByText('Todos los productos')).toBeInTheDocument();
    expect(screen.getByText('3 años')).toBeInTheDocument();
    expect(screen.queryByText(/2 años/)).not.toBeInTheDocument();
  });

  it('plazo ampliado por el tenant', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({ legal: { plazoDesistimientoDias: 30 } })} />);
    expect(screen.getByText(/30 días naturales/)).toBeInTheDocument();
  });

  it('gastos de devolución a cargo de la empresa', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({ legal: { gastosDevolucion: 'empresa' } })} />);
    expect(screen.getByText(/corren a nuestro cargo/i)).toBeInTheDocument();
  });

  it('muestra la dirección de devoluciones y las exclusiones marcadas', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({
      direccionDevoluciones: 'Almacén 3, Polígono Sur',
      legal: { exclusionesDesistimiento: { supuestos: ['personalizados'], otras: 'Baterías de ácido instaladas' } },
    })} />);
    expect(screen.getByText('Almacén 3, Polígono Sur')).toBeInTheDocument();
    expect(screen.getByText(/claramente personalizados \(art\. 103\.c\)/)).toBeInTheDocument();
    expect(screen.getByText('Baterías de ácido instaladas')).toBeInTheDocument();
  });

  it('garantía comercial extra por tipo de producto', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({
      legal: { garantias: [{ ambito: 'Baterías AGM', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 24 }] },
    })} />);
    expect(screen.getByText('Baterías AGM')).toBeInTheDocument();
    expect(screen.getByText('2 años')).toBeInTheDocument();
  });

  it('retención del reembolso condicionada a la recepción o a la prueba de devolución (art. 107.3)', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText(/prueba de su devolución, lo que ocurra primero/)).toBeInTheDocument();
    expect(screen.queryByText('Podemos retener el reembolso hasta recibir el producto.')).not.toBeInTheDocument();
  });

  it('incluye el modelo de formulario de desistimiento con el destinatario del tenant, incluido el teléfono', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba()} />);
    expect(screen.getByText('Modelo de formulario de desistimiento')).toBeInTheDocument();
    expect(screen.getByText(/A la atención de: Tienda de Prueba S\.L\., Calle Mayor 1, 38300 La Orotava, legal@tienda\.test, 922000000/)).toBeInTheDocument();
    expect(screen.getByText(/Por la presente le comunico\/comunicamos/)).toBeInTheDocument();
    expect(screen.getByText(/Nombre del consumidor y usuario o de los consumidores y usuarios:/)).toBeInTheDocument();
    expect(screen.getByText(/Domicilio del consumidor y usuario o de los consumidores y usuarios:/)).toBeInTheDocument();
    expect(screen.getByText(/Firma del consumidor y usuario o de los consumidores y usuarios \(solo si el presente formulario se presenta en papel\):/)).toBeInTheDocument();
    expect(screen.getByText(/\(\*\) Táchese lo que no proceda\./)).toBeInTheDocument();
  });

  it('destinatario del formulario de desistimiento sin dirección, email ni teléfono', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({
      titular: { nombre: 'Tienda Sin Datos S.L.', nif: null, direccion: null, email: null, telefono: null, registroMercantil: null },
    })} />);
    expect(screen.getByText(/A la atención de: Tienda Sin Datos S\.L\.\s/)).toBeInTheDocument();
  });

  it('incluye el teléfono del titular en el destinatario cuando hay email pero no dirección', () => {
    render(<DevolucionesContenido ctx={contextoDePrueba({
      titular: { nombre: 'Tienda Con Teléfono S.L.', nif: null, direccion: null, email: 'legal@tienda.test', telefono: '922111222', registroMercantil: null },
    })} />);
    expect(screen.getByText(/A la atención de: Tienda Con Teléfono S\.L\., legal@tienda\.test, 922111222/)).toBeInTheDocument();
  });
});
