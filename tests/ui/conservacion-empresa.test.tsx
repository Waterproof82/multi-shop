import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ConservacionEmpresa } from '@/components/conservacion/conservacion-empresa';
import { resumenRetencion } from '@/lib/empresa/retencion';

const hoy = new Date('2026-10-01T10:00:00Z');
const apartados = resumenRetencion(
  [
    { apartado: 'pedidos', ejercicio: 2019, registros: 3 },
    { apartado: 'pedidos', ejercicio: 2026, registros: 211 },
    { apartado: 'turnos', ejercicio: 2026, registros: 19 },
  ],
  hoy,
);

function fila(apartado: string, ejercicio: number) {
  return within(screen.getByRole('region', { name: apartado })).getByRole('row', { name: new RegExp(String.raw`^${ejercicio}\b`) });
}

describe('ConservacionEmpresa', () => {
  it('muestra cada apartado con su plazo y base legal', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="es" />);
    const pedidos = screen.getByRole('region', { name: 'Pedidos' });
    expect(pedidos).toHaveTextContent('6 años');
    expect(pedidos).toHaveTextContent('Art. 30 Código de Comercio');
    expect(screen.queryByRole('region', { name: 'Fichajes' })).not.toBeInTheDocument();
  });

  it('ejercicio en plazo: fecha y cuenta atrás', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="es" />);
    const f = fila('Pedidos', 2026);
    expect(f).toHaveTextContent('211');
    expect(f).toHaveTextContent('31/12/2032');
    expect(f).toHaveTextContent('6 años, 2 meses y 30 días');
  });

  it('ejercicio vencido: lo dice, sin cuenta atrás', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="es" />);
    expect(fila('Pedidos', 2019)).toHaveTextContent('Plazo cumplido');
  });

  it('sin descargas por defecto (vista del superadmin)', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="es" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('con descargas: un enlace por ejercicio donde hay exportador', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="es" conDescargas />);
    const enlace = within(fila('Pedidos', 2026)).getByRole('link', { name: 'Descargar pedidos de 2026' });
    expect(enlace).toHaveAttribute('href', '/api/admin/historial/pedidos?ejercicio=2026');
    expect(within(fila('Turnos y cierres Z', 2026)).queryByRole('link')).not.toBeInTheDocument();
  });

  it('sin datos: lo dice en vez de pintar una tabla vacía', () => {
    render(<ConservacionEmpresa apartados={[]} lang="es" />);
    expect(screen.getByText('Sin registros que conservar todavía.')).toBeInTheDocument();
  });

  it('un superadmin dentro del panel del tenant descarga con ?empresaId=', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="es" conDescargas empresaIdSuperadmin="e1" />);
    expect(within(fila('Pedidos', 2026)).getByRole('link')).toHaveAttribute('href', '/api/admin/historial/pedidos?ejercicio=2026&empresaId=e1');
  });

  it('respeta el idioma del panel', () => {
    render(<ConservacionEmpresa apartados={apartados} lang="en" />);
    const f = fila('Orders', 2026);
    expect(f).toHaveTextContent('6 years, 2 months and 30 days left');
  });
});
