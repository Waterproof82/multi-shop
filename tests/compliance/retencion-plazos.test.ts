import { describe, it, expect } from 'vitest';
import {
  APARTADOS_RETENCION,
  conservarHasta,
  tiempoRestante,
  estadoEjercicio,
  resumenRetencion,
  textoRestante,
  urlDescarga,
} from '@/lib/empresa/retencion';

const hoy = new Date('2026-10-01T10:00:00Z');

describe('plazos de conservación', () => {
  it('fija el plazo legal de cada apartado', () => {
    const plazos = Object.fromEntries(APARTADOS_RETENCION.map((a) => [a.clave, a.plazoAnios]));
    expect(plazos).toEqual({ pedidos: 6, cobros: 5, turnos: 5, fichajes: 4 });
  });

  it('el plazo cuenta por ejercicio completo: todo 2026 se conserva hasta el 31/12 del año N, en hora de Madrid', () => {
    // 23:59:59.999 en Madrid = 22:59:59.999 UTC (diciembre es CET, sin horario de verano).
    // Con 23:59 UTC, en Madrid ya sería 1 de enero y la pantalla mostraría el año siguiente.
    expect(conservarHasta(2026, 6).toISOString()).toBe('2032-12-31T22:59:59.999Z');
    expect(conservarHasta(2026, 4).toISOString()).toBe('2030-12-31T22:59:59.999Z');
  });
});

describe('tiempoRestante', () => {
  it('desglosa en años, meses y días', () => {
    expect(tiempoRestante(hoy, new Date('2032-12-31T22:59:59.999Z'))).toEqual({ anios: 6, meses: 2, dias: 30 });
  });

  it('devuelve null si el plazo ya venció', () => {
    expect(tiempoRestante(hoy, new Date('2026-09-30T23:59:59.999Z'))).toBeNull();
  });
});

describe('estadoEjercicio', () => {
  it('ejercicio en plazo: no vencido, con cuenta atrás', () => {
    const e = estadoEjercicio({ ejercicio: 2026, plazoAnios: 5, registros: 68 }, hoy);
    expect(e.vencido).toBe(false);
    expect(e.conservarHasta.toISOString()).toBe('2031-12-31T22:59:59.999Z');
    expect(e.restante).toEqual({ anios: 5, meses: 2, dias: 30 });
  });

  it('ejercicio vencido: sin cuenta atrás', () => {
    const e = estadoEjercicio({ ejercicio: 2019, plazoAnios: 6, registros: 3 }, hoy);
    expect(e.vencido).toBe(true);
    expect(e.restante).toBeNull();
  });
});

describe('resumenRetencion', () => {
  it('agrupa por apartado, ordena ejercicios de más antiguo a más nuevo y omite apartados sin datos', () => {
    const r = resumenRetencion(
      [
        { apartado: 'pedidos', ejercicio: 2026, registros: 211 },
        { apartado: 'pedidos', ejercicio: 2025, registros: 10 },
        { apartado: 'fichajes', ejercicio: 2026, registros: 40 },
      ],
      hoy,
    );
    expect(r.map((a) => a.clave)).toEqual(['pedidos', 'fichajes']);
    expect(r[0].ejercicios.map((e) => e.ejercicio)).toEqual([2025, 2026]);
    expect(r[0].ejercicios[0].registros).toBe(10);
  });

  it('ignora apartados desconocidos', () => {
    expect(resumenRetencion([{ apartado: 'otro', ejercicio: 2026, registros: 1 }], hoy)).toEqual([]);
  });
});

describe('textoRestante', () => {
  it('junta las partes con comas y "y", en singular cuando toca', () => {
    expect(textoRestante({ anios: 6, meses: 2, dias: 30 })).toBe('6 años, 2 meses y 30 días');
    expect(textoRestante({ anios: 1, meses: 0, dias: 1 })).toBe('1 año y 1 día');
    expect(textoRestante({ anios: 0, meses: 3, dias: 0 })).toBe('3 meses');
    expect(textoRestante({ anios: 0, meses: 0, dias: 0 })).toBe('hoy');
  });
});

describe('urlDescarga', () => {
  it('cada apartado descarga su ejercicio completo con el exportador que ya existe', () => {
    expect(urlDescarga('pedidos', 2026)).toBe('/api/admin/historial/pedidos?ejercicio=2026');
    expect(urlDescarga('cobros', 2026)).toBe('/api/tpv/audit/export?desde=2026-01-01&hasta=2026-12-31');
    expect(urlDescarga('fichajes', 2026)).toBe('/api/laborcontrol/export?tipo=excel&from=2026-01-01&to=2026-12-31');
  });

  it('los turnos aún no tienen exportador', () => {
    expect(urlDescarga('turnos', 2026)).toBeNull();
  });
});
