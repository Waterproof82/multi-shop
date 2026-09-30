import { describe, it, expect } from 'vitest';
import { garantiasVisibles, formatMeses } from '@/lib/legal/garantias';

describe('garantiasVisibles', () => {
  it('lista vacía → fila por defecto de 3 años para todos los productos', () => {
    expect(garantiasVisibles([])).toEqual([
      { ambito: 'Todos los productos', estado: 'nuevo', mesesLegales: 36, mesesComercialesExtra: 0 },
    ]);
  });

  it('fuerza 36 meses en producto nuevo aunque el dato guardado diga otra cosa', () => {
    const [f] = garantiasVisibles([{ ambito: 'Baterías', estado: 'nuevo', mesesLegales: 24, mesesComercialesExtra: 12 }]);
    expect(f.mesesLegales).toBe(36);
    expect(f.mesesComercialesExtra).toBe(12);
  });

  it('sube a 12 meses una segunda mano guardada por debajo del suelo', () => {
    const [f] = garantiasVisibles([{ ambito: 'Usados', estado: 'segunda_mano', mesesLegales: 6, mesesComercialesExtra: 0 }]);
    expect(f.mesesLegales).toBe(12);
  });

  it('respeta segunda mano por encima del suelo', () => {
    const [f] = garantiasVisibles([{ ambito: 'Usados', estado: 'segunda_mano', mesesLegales: 18, mesesComercialesExtra: 0 }]);
    expect(f.mesesLegales).toBe(18);
  });
});

describe('formatMeses', () => {
  it.each([
    [36, '3 años'],
    [12, '1 año'],
    [18, '18 meses'],
    [1, '1 mes'],
    [0, '—'],
  ])('%i → %s', (meses, esperado) => {
    expect(formatMeses(meses)).toBe(esperado);
  });
});
