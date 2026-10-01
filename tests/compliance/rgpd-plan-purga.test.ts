import { describe, it, expect } from 'vitest';
import { planDePurga, CAMPOS_ANONIMIZADOS, CAMPOS_PEDIDO_ANONIMIZADOS } from '@/lib/rgpd/plan-purga';

const ahora = new Date('2026-10-01T00:00:00.000Z');

describe('planDePurga', () => {
  it('agrupa por plazo: con TPV 5 años, sin TPV 3 años', () => {
    const plan = planDePurga(
      [
        { id: 'a', tpvHabilitado: true },
        { id: 'b', tpvHabilitado: false },
        { id: 'c', tpvHabilitado: true },
      ],
      ahora,
    );
    expect(plan).toEqual([
      { anios: 5, empresaIds: ['a', 'c'], corte: '2021-10-01T00:00:00.000Z' },
      { anios: 3, empresaIds: ['b'], corte: '2023-10-01T00:00:00.000Z' },
    ]);
  });

  it('omite los grupos vacíos (no lanza una consulta con IN ())', () => {
    expect(planDePurga([{ id: 'b', tpvHabilitado: false }], ahora)).toEqual([
      { anios: 3, empresaIds: ['b'], corte: '2023-10-01T00:00:00.000Z' },
    ]);
    expect(planDePurga([], ahora)).toEqual([]);
  });
});

describe('CAMPOS_ANONIMIZADOS', () => {
  it('borra TODOS los datos personales de contacto, incluida la dirección de entrega', () => {
    expect(CAMPOS_ANONIMIZADOS).toEqual({ nombre: 'ANONIMIZADO', email: null, telefono: null, direccion: null });
  });

  it('borra también la COPIA de la dirección y la ubicación exacta guardada en cada pedido', () => {
    // Solo columnas que ningún trigger AFTER UPDATE de `pedidos` vigila
    // (estado, detalle_pedido, total): el borrado no dispara Realtime ni push.
    expect(CAMPOS_PEDIDO_ANONIMIZADOS).toEqual({
      direccion_entrega: null,
      codigo_postal: null,
      latitude_entrega: null,
      longitude_entrega: null,
    });
  });
});
