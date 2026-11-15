/**
 * Tests unitarios del escalado por personas (configurador de kits).
 *
 * `factorPeople` es el espejo TS de `factor_regla()` en la migración
 * 20261114000001_store_people_configurator.sql: los casos límite aquí son los
 * mismos que el smoke SQL ejercita en el lado de la DB. Si este test y el
 * smoke divergen, uno de los dos espejos está mal.
 */
import { describe, it, expect } from 'vitest';
import {
  parseRegla,
  factorPeople,
  precioUnitarioPeople,
  escalaCantidad,
  escalaCeldaCantidad,
  parsePersonasParam,
} from '@/lib/catalogo/escala-people';

describe('parseRegla', () => {
  it('acepta el vocabulario del CHECK (por_persona, compartido, pack:C)', () => {
    expect(parseRegla('por_persona')).toBe('por_persona');
    expect(parseRegla('compartido')).toBe('compartido');
    expect(parseRegla('pack:4')).toBe('pack:4');
    expect(parseRegla('pack:1')).toBe('pack:1');
  });

  it('rechaza lo que el CHECK también rechaza', () => {
    // El vocabulario NO tiene 'por_persona:C': "C unidades por persona" se
    // modela con base C y regla 'por_persona' (la ración del Plus).
    expect(parseRegla('por_persona:2')).toBeNull();
    expect(parseRegla('pack:0')).toBeNull();
    expect(parseRegla('PACK:4')).toBeNull();
    expect(parseRegla('')).toBeNull();
    expect(parseRegla(null)).toBeNull();
    expect(parseRegla(42)).toBeNull();
  });
});

describe('factorPeople (espejo de factor_regla)', () => {
  it('por_persona escala ×N', () => {
    expect(factorPeople('por_persona', 1)).toBe(1);
    expect(factorPeople('por_persona', 3)).toBe(3);
    expect(factorPeople('por_persona', 10)).toBe(10);
  });

  it('pack:C escala por ceil(N/C), no por N', () => {
    // Pastillas (envase cubre 4): N=1..4 → 1 envase; N=5..8 → 2; N=9..10 → 3.
    expect(factorPeople('pack:4', 1)).toBe(1);
    expect(factorPeople('pack:4', 4)).toBe(1);
    expect(factorPeople('pack:4', 5)).toBe(2);
    expect(factorPeople('pack:4', 8)).toBe(2);
    expect(factorPeople('pack:4', 9)).toBe(3);
    // Fundas (pack 3): N=3 → 1, N=4 → 2.
    expect(factorPeople('pack:3', 3)).toBe(1);
    expect(factorPeople('pack:3', 4)).toBe(2);
  });

  it('compartido y regla ausente no escalan nunca', () => {
    expect(factorPeople('compartido', 10)).toBe(1);
    expect(factorPeople(null, 10)).toBe(1);
  });

  it('entradas degeneradas devuelven 1 (mismo guard que la SQL)', () => {
    expect(factorPeople('por_persona', 0)).toBe(1);
    expect(factorPeople('por_persona', -3)).toBe(1);
    expect(factorPeople('por_persona', NaN)).toBe(1);
  });
});

describe('precioUnitarioPeople', () => {
  it('precio del kit Estándar: 199 € + 100 € por persona extra', () => {
    expect(precioUnitarioPeople(199, 10000, 1, 1)).toBe(199);
    expect(precioUnitarioPeople(199, 10000, 1, 2)).toBe(299);
    expect(precioUnitarioPeople(199, 10000, 1, 10)).toBe(1099);
  });

  it('redondea a céntimo y respeta min ≠ 1', () => {
    expect(precioUnitarioPeople(19.99, 5, 2, 3)).toBe(20.04); // 19.99 + 0.05
  });
});

describe('escalaCantidad / escalaCeldaCantidad', () => {
  it('multiplica la cantidad base por el factor (entero)', () => {
    expect(escalaCantidad(1, 'por_persona', 4)).toBe(4);
    expect(escalaCantidad(2, 'por_persona', 3)).toBe(6); // ración base-2 del Plus
    expect(escalaCantidad(50, 'pack:4', 6)).toBe(100); // pastillas: ceil(6/4) envases × 50
    expect(escalaCantidad(1, null, 9)).toBe(1);
  });

  it('escala la CELDA conservando el sufijo textual', () => {
    expect(escalaCeldaCantidad('1', 'por_persona', 4)).toBe('4');
    expect(escalaCeldaCantidad('2', 'por_persona', 3)).toBe('6');
    expect(escalaCeldaCantidad('50 uds.', 'pack:4', 6)).toBe('100 uds.');
    // Celdas sin número (fila compartida con texto) quedan intactas.
    expect(escalaCeldaCantidad('Recambio', 'por_persona', 4)).toBe('Recambio');
    expect(escalaCeldaCantidad('', 'por_persona', 4)).toBe('');
  });
});

describe('parsePersonasParam (?personas= del PDP)', () => {
  it('acepta el primer entero ≥ 1 (o el primero si viniera repetido)', () => {
    expect(parsePersonasParam('3')).toBe(3);
    expect(parsePersonasParam(['7', '9'])).toBe(7);
    expect(parsePersonasParam(undefined)).toBeNull();
  });

  it('rechaza lo que no es un entero ≥ 1', () => {
    expect(parsePersonasParam('0')).toBeNull();
    expect(parsePersonasParam('-2')).toBeNull();
    expect(parsePersonasParam('abc')).toBeNull();
  });
});
