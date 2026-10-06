import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { BcgTooltip } from '@/components/analytics/BcgScatterChart';

// Recharts arma el payload del Scatter con `name` = nombre del EJE ("Unidades",
// "Margen"); el dato original va en `payload`. Leer `payload[0].name` pintaba
// "Unidades" como titulo del tooltip en vez del plato (2026-10-06).
const payloadDeRecharts = [
  { name: 'Unidades', value: 42, payload: { x: 42, y: 61.25, name: 'Paella valenciana' } },
  { name: 'Margen', value: 61.25, payload: { x: 42, y: 61.25, name: 'Paella valenciana' } },
];

function renderTooltip(active: boolean, payload = payloadDeRecharts) {
  return render(
    <LanguageProvider>
      <BcgTooltip active={active} payload={payload} />
    </LanguageProvider>
  );
}

describe('BcgTooltip', () => {
  it('titula con el nombre del plato, no con el nombre del eje', () => {
    renderTooltip(true);
    expect(screen.getByText('Paella valenciana')).toBeInTheDocument();
    expect(screen.queryByText('Unidades')).not.toBeInTheDocument();
  });

  it('muestra unidades y margen con un decimal', () => {
    renderTooltip(true);
    expect(screen.getByText(/42/)).toBeInTheDocument();
    expect(screen.getByText(/61\.3 %/)).toBeInTheDocument();
  });

  it('no pinta nada si el tooltip no esta activo', () => {
    const { container } = renderTooltip(false);
    expect(container).toBeEmptyDOMElement();
  });

  it('no pinta nada con un payload incompleto', () => {
    const { container } = renderTooltip(true, payloadDeRecharts.slice(0, 1));
    expect(container).toBeEmptyDOMElement();
  });
});
