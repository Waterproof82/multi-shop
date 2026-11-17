import { describe, expect, it } from 'vitest';
import { estadoDelKit, diasHasta } from '@/lib/kit-caducidad/estado';

// sdd kit-expiry-reminders R3.0: estado por elemento (el botiquín por
// partes) y estado general = el peor, o «Todo al día».

const pastillas = { consumible: 'Pastillas Potabilizadoras de Agua (50 uds.)', parte: '' };
const antiseptico = { consumible: 'Botiquín de primeros auxilios conforme a DIN 13164', parte: 'Antiséptico' };

describe('diasHasta', () => {
  it('cuenta días naturales entre fechas ISO sin depender de la zona horaria', () => {
    expect(diasHasta('2031-01-30', '2031-03-01')).toBe(30);
    expect(diasHasta('2031-03-01', '2031-03-01')).toBe(0);
    expect(diasHasta('2031-03-02', '2031-03-01')).toBe(-1);
  });
});

describe('estadoDelKit', () => {
  it('da «al día» cuando todo caduca dentro de más de 30 días', () => {
    // Arrange
    const caducidades = [{ ...pastillas, caducaEl: '2031-03-01' }, { ...antiseptico, caducaEl: '2030-12-31' }];

    // Act
    const estado = estadoDelKit('2030-06-01', caducidades);

    // Assert
    expect(estado.general).toBe('al_dia');
    expect(estado.elementos.map((e) => e.estado)).toEqual(['al_dia', 'al_dia']);
  });

  it('marca «caduca pronto» a 30 días o menos, y el general es el peor', () => {
    const estado = estadoDelKit('2031-01-30', [
      { ...pastillas, caducaEl: '2031-03-01' },
      { ...antiseptico, caducaEl: '2032-01-01' },
    ]);

    expect(estado.elementos[0]).toMatchObject({ estado: 'caduca_pronto', diasRestantes: 30 });
    expect(estado.general).toBe('caduca_pronto');
  });

  it('el último día de la fecha sigue siendo válido; el siguiente ya está caducado', () => {
    expect(estadoDelKit('2031-03-01', [{ ...pastillas, caducaEl: '2031-03-01' }]).general).toBe('caduca_pronto');
    expect(estadoDelKit('2031-03-02', [{ ...pastillas, caducaEl: '2031-03-01' }]).general).toBe('caducado');
  });

  it('ordena los elementos por fecha, lo más urgente primero', () => {
    const estado = estadoDelKit('2030-01-01', [
      { ...pastillas, caducaEl: '2033-01-01' },
      { ...antiseptico, caducaEl: '2031-01-01' },
    ]);

    expect(estado.elementos.map((e) => e.parte)).toEqual(['Antiséptico', '']);
  });

  it('da «sin datos» si el lote no tiene fechas cargadas', () => {
    expect(estadoDelKit('2030-01-01', []).general).toBe('sin_datos');
  });
});
