/**
 * Cobro manual de una mesa (el camarero marca "pagado" sin pasar por Redsys).
 *
 * POR QUÉ ESTE TEST EXISTE
 * `registerManualMesaPaymentUseCase` tenía complejidad 24 y ninguna prueba. Es
 * la vía por la que el personal cierra una cuenta cobrando en efectivo o con un
 * datáfono ajeno, y decide tres cosas: si la sesión queda saldada, si se libera
 * el bloqueo de cobro, y en las cuentas divididas cuántos comensales han pagado.
 *
 * Las barreras de tenant y de doble cobro son lo primero que se comprueba: sin
 * ellas, esta función permitiría cerrar la mesa de otra empresa o contabilizar
 * dos veces el mismo pago.
 *
 * Escritas ANTES de refactorizar, contra el código tal cual estaba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearFakeSupabase, llamadasDe, type FakeSupabase } from '../helpers/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: () => fake,
}));
vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: {
    logAndReturnError: vi.fn(async (code: string, message: string) => ({ code, message, module: 'use-case' })),
    logFromCatch: vi.fn(async () => ({ code: 'X', message: 'x', module: 'use-case' })),
  },
}));

const { registerManualMesaPaymentUseCase } = await import(
  '@/core/application/use-cases/payment/registerManualMesaPaymentUseCase'
);

const MESA = 'm1';
const EMPRESA = 'e1';

function sesion(extra: Record<string, unknown> = {}) {
  return {
    data: {
      id: 's1', empresa_id: EMPRESA, division_personas: null,
      division_pagos_realizados: 0, sesion_pagada: false,
      division_tipo: null, custom_turno_id: null, ...extra,
    },
  };
}

const cobrar = (turnoId?: string) =>
  registerManualMesaPaymentUseCase({ mesaId: MESA, empresaId: EMPRESA, turnoId });

const marcoSesionPagada = () =>
  llamadasDe(fake, 'mesa_sesiones').some(
    (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
  );
const libereBloqueo = () =>
  llamadasDe(fake, 'mesa_sesiones').some(
    (l) => (l.payload as Record<string, unknown>)?.['pago_en_curso'] === false,
  );

beforeEach(() => { fake = crearFakeSupabase(); });

describe('barreras', () => {
  it('falla si la mesa no tiene sesión abierta', async () => {
    fake = crearFakeSupabase({ tablas: { 'mesa_sesiones.select': { data: null } } });
    const res = await cobrar();

    expect(res.success).toBe(false);
    expect(!res.success && res.error.code).toBe('NOT_FOUND');
  });

  it('AISLAMIENTO DE TENANT: no deja cobrar la sesión de otra empresa', async () => {
    fake = crearFakeSupabase({ tablas: { 'mesa_sesiones.select': sesion({ empresa_id: 'otra-empresa' }) } });
    const res = await cobrar();

    expect(!res.success && res.error.code).toBe('FORBIDDEN');
    // Y sin escribir nada, que es lo que de verdad importa.
    expect(fake.llamadas.filter((l) => l.operacion !== 'select')).toEqual([]);
  });

  it('IDEMPOTENCIA: no deja cobrar dos veces una sesión ya pagada', async () => {
    fake = crearFakeSupabase({ tablas: { 'mesa_sesiones.select': sesion({ sesion_pagada: true }) } });
    const res = await cobrar();

    expect(!res.success && res.error.code).toBe('ALREADY_PAID');
    expect(fake.llamadas.filter((l) => l.operacion !== 'select')).toEqual([]);
  });
});

describe('cuenta sin dividir', () => {
  it('marca la sesión pagada y libera el bloqueo', async () => {
    fake = crearFakeSupabase({ tablas: { 'mesa_sesiones.select': sesion() } });
    const res = await cobrar();

    expect(res.success && res.data).toEqual({ pagosRealizados: 0, personas: null, fullyPaid: true });
    expect(marcoSesionPagada()).toBe(true);
    expect(libereBloqueo()).toBe(true);
    expect(llamadasDe(fake, 'pedidos').some((l) => l.operacion === 'update')).toBe(true);
  });
});

describe('cuenta dividida a partes iguales', () => {
  const conDivision = (realizados: number, personas: number) => crearFakeSupabase({
    tablas: { 'mesa_sesiones.select': sesion({ division_personas: personas }) },
    rpcs: { increment_division_pagos: { data: [{ pagos_realizados: realizados, personas }] } },
  });

  it('cierra la cuenta cuando paga el último comensal', async () => {
    fake = conDivision(4, 4);
    const res = await cobrar();

    expect(res.success && res.data).toEqual({ pagosRealizados: 4, personas: 4, fullyPaid: true });
    expect(marcoSesionPagada()).toBe(true);
  });

  it('solo suelta el bloqueo si aún faltan comensales', async () => {
    // Si no lo soltara, el resto no podría pagar: la mesa quedaría tomada.
    fake = conDivision(2, 4);
    const res = await cobrar();

    expect(res.success && res.data.fullyPaid).toBe(false);
    expect(marcoSesionPagada()).toBe(false);
    expect(libereBloqueo()).toBe(true);
  });

  it('usa el contador atómico de la base, no un cálculo propio', async () => {
    fake = conDivision(1, 3);
    await cobrar();

    expect(fake.rpcs.map((r) => r.nombre)).toEqual(['increment_division_pagos']);
  });
});

describe('cuenta dividida a la carta (personalizado)', () => {
  const personalizado = (extra: Record<string, unknown> = {}, rpcs = {}) => crearFakeSupabase({
    tablas: { 'mesa_sesiones.select': sesion({ division_tipo: 'personalizado', ...extra }) },
    rpcs,
  });

  it('confirma la selección y la completa, en ese orden', async () => {
    fake = personalizado({ custom_turno_id: 't1' }, {
      commit_custom_payment: { data: [{ success: true, error_code: null }] },
      complete_custom_payment: { data: [{ success: true, sesion_completa: true, out_sesion_id: 's1' }] },
    });
    const res = await cobrar();

    expect(fake.rpcs.map((r) => r.nombre)).toEqual(['commit_custom_payment', 'complete_custom_payment']);
    expect(res.success && res.data.fullyPaid).toBe(true);
  });

  it('corta si la confirmación de la selección falla, sin completar nada', async () => {
    fake = personalizado({ custom_turno_id: 't1' }, {
      commit_custom_payment: { data: [{ success: false, error_code: 'TURNO_NO_VALIDO' }] },
    });
    const res = await cobrar();

    expect(!res.success && res.error.code).toBe('TURNO_NO_VALIDO');
    expect(fake.rpcs.map((r) => r.nombre)).toEqual(['commit_custom_payment']);
    expect(marcoSesionPagada()).toBe(false);
  });

  it('sin turno activo, el camarero cierra la cuenta entera', async () => {
    // Es el override manual: no hay selección en curso que confirmar, así que
    // se da por saldada toda la mesa sin llamar a ninguna RPC.
    fake = personalizado({ custom_turno_id: null });
    const res = await cobrar();

    expect(res.success && res.data.fullyPaid).toBe(true);
    expect(fake.rpcs).toEqual([]);
    expect(marcoSesionPagada()).toBe(true);
  });

  it('el turno recibido por parámetro manda sobre el de la sesión', async () => {
    fake = personalizado({ custom_turno_id: 'de-la-sesion' }, {
      commit_custom_payment: { data: [{ success: true, error_code: null }] },
      complete_custom_payment: { data: [{ success: true, sesion_completa: false, out_sesion_id: null }] },
    });
    await cobrar('del-parametro');

    expect(fake.rpcs[0].args?.['p_turno_id']).toBe('del-parametro');
  });

  it('no cierra la sesión si aún quedan turnos por pagar', async () => {
    fake = personalizado({ custom_turno_id: 't1' }, {
      commit_custom_payment: { data: [{ success: true, error_code: null }] },
      complete_custom_payment: { data: [{ success: true, sesion_completa: false, out_sesion_id: null }] },
    });
    const res = await cobrar();

    expect(res.success && res.data.fullyPaid).toBe(false);
    expect(marcoSesionPagada()).toBe(false);
    expect(libereBloqueo()).toBe(true);
  });
});
