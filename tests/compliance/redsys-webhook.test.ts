/**
 * Comportamiento del webhook de Redsys.
 *
 * POR QUÉ ESTE TEST EXISTE
 * `processRedsysWebhookUseCase` es donde el dinero entra al sistema: decide si
 * un pedido queda pagado, si la mesa se libera, si se avisa a cocina y si sale
 * un reparto de Glovo. Tenía complejidad cognitiva 49 y CERO pruebas — no por
 * dejadez, sino porque hasta ahora vitest no resolvía el alias `@/` y no podía
 * ni importar el módulo.
 *
 * Estas pruebas se escribieron ANTES de refactorizar, contra el código tal como
 * estaba, para fijar lo que hace hoy. Su valor no es documentar el diseño ideal
 * sino detectar cualquier cambio de conducta durante la extracción. Si alguna
 * cae tras un refactor, el refactor cambió algo — no la prueba.
 *
 * LO QUE MÁS IMPORTA AQUÍ ES LA IDEMPOTENCIA. Redsys reintenta sus avisos, y en
 * los tres caminos de pago un doble procesado significa cobrar o contabilizar
 * dos veces. Cada camino tiene su guarda y cada guarda tiene su prueba.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearFakeSupabase, llamadasDe, type FakeSupabase } from '../helpers/fake-supabase';

// El caso de uso resuelve el cliente y la verificación de firma por módulo, así
// que se interceptan ahí. `verifyRedsysWebhook` es criptografía real: se prueba
// aparte, aquí solo interesa qué hace el caso de uso según su veredicto.
let fake: FakeSupabase;
let firmaValida = true;

vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: () => fake,
}));
vi.mock('@/core/infrastructure/services/redsys.service', () => ({
  verifyRedsysWebhook: () => firmaValida,
}));
vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: {
    logAndReturnError: vi.fn(async () => undefined),
    logFromCatch: vi.fn(async () => ({ code: 'X', message: 'x', module: 'use-case' })),
  },
}));
const glovoSpy = vi.fn(async () => ({ success: true as const, data: {} }));
vi.mock('@/core/application/use-cases/glovo/createGlovoOrderUseCase', () => ({
  createGlovoOrderUseCase: (...args: unknown[]) => glovoSpy(...(args as [])),
}));
const telegramSpy = vi.fn(async () => ({ success: true as const, data: { messageId: 42 } }));
vi.mock('@/core/infrastructure/services/telegram.service', () => ({
  sendTelegramWithInlineButtons: (...a: unknown[]) => telegramSpy(...(a as [])),
  sendTelegramWithQuickReplies: (...a: unknown[]) => telegramSpy(...(a as [])),
}));

const { processRedsysWebhookUseCase } = await import(
  '@/core/application/use-cases/payment/processRedsysWebhookUseCase'
);

const EMPRESA = 'empresa-1';
const ORDEN = '000000001234';

/** Cuerpo tal y como lo manda Redsys: JSON en Base64. */
function parametros(extra: Record<string, unknown> = {}): string {
  return Buffer.from(JSON.stringify({ Ds_Order: ORDEN, Ds_Response: '0000', ...extra }), 'utf8')
    .toString('base64');
}

function invocar(dsParameters = parametros()) {
  return processRedsysWebhookUseCase({
    dsParameters,
    dsSignature: 'firma',
    dsSignatureVersion: 'HMAC_SHA256_V1',
    empresaId: EMPRESA,
  });
}

/** Empresa con clave configurada — el caso base de casi todas las pruebas. */
const EMPRESA_OK = {
  'empresas.select': { data: { redsys_secret_key: 'k', telegram_chat_id: null, tipo: 'restaurante' } },
};

beforeEach(() => {
  firmaValida = true;
  glovoSpy.mockClear();
  telegramSpy.mockClear();
});

describe('barreras previas: nada se procesa sin superarlas', () => {
  it('no verifica si el cuerpo no es Base64 con JSON dentro', async () => {
    fake = crearFakeSupabase();
    const res = await invocar('esto-no-es-base64-valido-%%%');

    expect(res.success && res.data.verified).toBe(false);
    // Y no llegó a tocar la base: ni siquiera buscó la empresa.
    expect(fake.llamadas).toEqual([]);
  });

  it('no verifica si falta Ds_Order', async () => {
    fake = crearFakeSupabase();
    const cuerpo = Buffer.from(JSON.stringify({ Ds_Response: '0000' })).toString('base64');
    const res = await invocar(cuerpo);

    expect(res.success && res.data.verified).toBe(false);
    expect(fake.llamadas).toEqual([]);
  });

  it('no verifica si la empresa no tiene clave de Redsys configurada', async () => {
    fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { redsys_secret_key: null, telegram_chat_id: null, tipo: 'tienda' } } },
    });
    const res = await invocar();

    expect(res.success && res.data.verified).toBe(false);
  });

  it('no verifica si la firma no valida — y no escribe NADA', async () => {
    firmaValida = false;
    fake = crearFakeSupabase({ tablas: EMPRESA_OK });
    const res = await invocar();

    expect(res.success && res.data.verified).toBe(false);
    // La barrera importa: sin firma válida no puede haber ni una escritura.
    expect(fake.llamadas.filter((l) => l.operacion !== 'select')).toEqual([]);
    expect(fake.rpcs).toEqual([]);
  });
});

describe('código de respuesta de Redsys', () => {
  const conCustomPago = (respuesta: string) => {
    fake = crearFakeSupabase({
      tablas: {
        ...EMPRESA_OK,
        'mesa_pagos_personalizados.select': { data: { id: 't1', status: 'en_pago', sesion_id: 's1', empresa_id: EMPRESA } },
      },
      rpcs: { complete_custom_payment: { data: [{ success: true, sesion_completa: false, out_sesion_id: null }] } },
    });
    return invocar(parametros({ Ds_Response: respuesta }));
  };

  it('0000 a 0099 es pago aceptado', async () => {
    // Ojo: antes esto invocaba `conCustomPago('0000')` DOS veces y comprobaba el
    // `success` de una contra el `data` de la otra. Son objetos distintos, así
    // que TypeScript no podía estrechar el Result — y el webhook se ejecutaba
    // dos veces por assertion.
    const r00 = await conCustomPago('0000');
    expect(r00.success && r00.data).toMatchObject({ paymentStatus: 'paid' });
    const r99 = await conCustomPago('0099');
    expect(r99.success && r99.data.paymentStatus).toBe('paid');
  });

  it('0100 en adelante es rechazo', async () => {
    const r = await conCustomPago('0100');
    expect(r.success && r.data.paymentStatus).toBe('failed');
    // Y el turno se cancela, que es lo que libera la mesa.
    expect(fake.rpcs.map((x) => x.nombre)).toContain('cancel_custom_turn');
  });

  it('sin Ds_Response se trata como rechazo, no como aceptado', async () => {
    // El fallback es '9999'. Si algún día alguien lo cambia a '0000' por
    // descuido, se estarían dando por cobrados pedidos que Redsys no confirmó.
    fake = crearFakeSupabase({
      tablas: {
        ...EMPRESA_OK,
        'mesa_pagos_personalizados.select': { data: { id: 't1', status: 'en_pago', sesion_id: 's1', empresa_id: EMPRESA } },
      },
    });
    const cuerpo = Buffer.from(JSON.stringify({ Ds_Order: ORDEN })).toString('base64');
    const res = await invocar(cuerpo);

    expect(res.success && res.data.paymentStatus).toBe('failed');
  });
});

describe('camino 0 — turno de pago personalizado', () => {
  it('marca la sesión pagada cuando el turno completa la cuenta', async () => {
    fake = crearFakeSupabase({
      tablas: {
        ...EMPRESA_OK,
        'mesa_pagos_personalizados.select': { data: { id: 't1', status: 'en_pago', sesion_id: 's1', empresa_id: EMPRESA } },
      },
      rpcs: { complete_custom_payment: { data: [{ success: true, sesion_completa: true, out_sesion_id: 's1' }] } },
    });
    const res = await invocar();

    expect(res.success && res.data).toEqual({ verified: true, paymentStatus: 'paid' });
    expect(llamadasDe(fake, 'pedidos').some((l) => l.operacion === 'update')).toBe(true);
    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(true);
  });

  it('no marca nada pagado si el turno no completó la cuenta', async () => {
    fake = crearFakeSupabase({
      tablas: {
        ...EMPRESA_OK,
        'mesa_pagos_personalizados.select': { data: { id: 't1', status: 'en_pago', sesion_id: 's1', empresa_id: EMPRESA } },
      },
      rpcs: { complete_custom_payment: { data: [{ success: true, sesion_completa: false, out_sesion_id: null }] } },
    });
    await invocar();

    expect(llamadasDe(fake, 'pedidos').filter((l) => l.operacion === 'update')).toEqual([]);
  });

  it('IDEMPOTENCIA: un turno que ya no está en_pago se ignora', async () => {
    // Redsys reintenta. Sin esta guarda, el segundo aviso volvería a completar
    // el turno y a repartir el importe entre los comensales otra vez.
    fake = crearFakeSupabase({
      tablas: {
        ...EMPRESA_OK,
        'mesa_pagos_personalizados.select': { data: { id: 't1', status: 'pagado', sesion_id: 's1', empresa_id: EMPRESA } },
      },
    });
    const res = await invocar();

    expect(res.success && res.data).toEqual({ verified: true, skipped: true });
    expect(fake.rpcs).toEqual([]);
  });
});

describe('camino 1 — pago por división de cuenta', () => {
  const divisionBase = {
    ...EMPRESA_OK,
    'mesa_pagos_personalizados.select': { data: null },
    'mesa_division_pagos.select': { data: { id: 'd1', sesion_id: 's1', empresa_id: EMPRESA, status: 'pending' } },
  };

  it('IDEMPOTENCIA: si otro aviso ya reclamó la fila, no cuenta el pago dos veces', async () => {
    // La reclamación es un UPDATE condicionado a status='pending'. Si no
    // devuelve fila, otro proceso ganó la carrera. Sin esto, dos avisos
    // simultáneos incrementarían dos veces los pagos realizados y la mesa
    // se daría por saldada habiendo cobrado a una persona menos.
    fake = crearFakeSupabase({
      tablas: { ...divisionBase, 'mesa_division_pagos.update': { data: null } },
    });
    const res = await invocar();

    expect(res.success && res.data).toEqual({ verified: true, skipped: true });
    expect(fake.rpcs.map((r) => r.nombre)).not.toContain('increment_division_pagos');
  });

  it('cierra la cuenta cuando el último comensal paga', async () => {
    fake = crearFakeSupabase({
      tablas: { ...divisionBase, 'mesa_division_pagos.update': { data: { id: 'd1' } } },
      rpcs: { increment_division_pagos: { data: [{ pagos_realizados: 4, personas: 4 }] } },
    });
    const res = await invocar();

    expect(res.success && res.data.paymentStatus).toBe('paid');
    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(true);
  });

  it('no cierra la cuenta si aún faltan comensales por pagar', async () => {
    fake = crearFakeSupabase({
      tablas: { ...divisionBase, 'mesa_division_pagos.update': { data: { id: 'd1' } } },
      rpcs: { increment_division_pagos: { data: [{ pagos_realizados: 2, personas: 4 }] } },
    });
    await invocar();

    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(false);
  });

  it('libera el bloqueo de la mesa TAMBIÉN cuando el pago se rechaza', async () => {
    // Si no se liberase, la mesa quedaría con `pago_en_curso` y nadie podría
    // pedir ni volver a intentar el cobro hasta que caducara el lock.
    fake = crearFakeSupabase({
      tablas: { ...divisionBase, 'mesa_division_pagos.update': { data: { id: 'd1' } } },
    });
    const res = await invocar(parametros({ Ds_Response: '0180' }));

    expect(res.success && res.data.paymentStatus).toBe('failed');
    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['pago_en_curso'] === false,
    )).toBe(true);
  });
});

describe('camino 2 — pago completo del pedido', () => {
  const pedidoBase = (extra: Record<string, unknown> = {}) => ({
    ...EMPRESA_OK,
    'mesa_pagos_personalizados.select': { data: null },
    'mesa_division_pagos.select': { data: null },
    'pedidos.select': {
      data: {
        id: 'p1', payment_status: 'pending', empresa_id: EMPRESA, total: 20, numero_pedido: 7,
        payment_order_ref: ORDEN, sesion_id: null, origen: 'recogida', detalle_pedido: [],
        tracking_token: 'tk', clientes: { nombre: 'Ana', telefono: '600', email: 'a@b.co' },
        ...extra,
      },
    },
  });

  it('IDEMPOTENCIA: un pedido ya pagado se ignora', async () => {
    fake = crearFakeSupabase({ tablas: pedidoBase({ payment_status: 'paid' }) });
    const res = await invocar();

    expect(res.success && res.data).toEqual({ verified: true, skipped: true });
    expect(llamadasDe(fake, 'pedidos').filter((l) => l.operacion === 'update')).toEqual([]);
    expect(telegramSpy).not.toHaveBeenCalled();
    expect(glovoSpy).not.toHaveBeenCalled();
  });

  it('verifica pero no falla cuando la orden no corresponde a ningún pedido', async () => {
    fake = crearFakeSupabase({
      tablas: {
        ...EMPRESA_OK,
        'mesa_pagos_personalizados.select': { data: null },
        'mesa_division_pagos.select': { data: null },
        'pedidos.select': { data: null },
      },
    });
    const res = await invocar();

    expect(res.success && res.data).toEqual({ verified: true });
  });

  it('avisa por Telegram en pedidos de recogida ya cobrados', async () => {
    fake = crearFakeSupabase({
      tablas: {
        ...pedidoBase(),
        'empresas.select': { data: { redsys_secret_key: 'k', telegram_chat_id: 'chat-1', tipo: 'restaurante' } },
      },
    });
    await invocar();

    expect(telegramSpy).toHaveBeenCalledTimes(1);
  });

  it('NO avisa por Telegram si el pago se rechaza', async () => {
    fake = crearFakeSupabase({
      tablas: {
        ...pedidoBase(),
        'empresas.select': { data: { redsys_secret_key: 'k', telegram_chat_id: 'chat-1', tipo: 'restaurante' } },
      },
    });
    await invocar(parametros({ Ds_Response: '0190' }));

    expect(telegramSpy).not.toHaveBeenCalled();
  });

  it('despacha Glovo solo en pedidos de delivery cobrados', async () => {
    fake = crearFakeSupabase({
      tablas: pedidoBase({ origen: 'delivery', direccion_entrega: 'Calle 1', latitude_entrega: 1, longitude_entrega: 2 }),
    });
    await invocar();

    expect(glovoSpy).toHaveBeenCalledTimes(1);
  });

  it('NO despacha Glovo en pedidos de recogida', async () => {
    fake = crearFakeSupabase({ tablas: pedidoBase({ origen: 'recogida' }) });
    await invocar();

    expect(glovoSpy).not.toHaveBeenCalled();
  });

  it('con sesión de mesa: marca toda la sesión pagada y libera el bloqueo', async () => {
    fake = crearFakeSupabase({ tablas: pedidoBase({ sesion_id: 's9' }) });
    await invocar();

    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['sesion_pagada'] === true,
    )).toBe(true);
    expect(llamadasDe(fake, 'mesa_sesiones').some(
      (l) => (l.payload as Record<string, unknown>)?.['pago_en_curso'] === false,
    )).toBe(true);
  });

  it('con sesión de mesa NO manda Telegram: de eso se encarga cocina/bar', async () => {
    fake = crearFakeSupabase({
      tablas: {
        ...pedidoBase({ sesion_id: 's9' }),
        'empresas.select': { data: { redsys_secret_key: 'k', telegram_chat_id: 'chat-1', tipo: 'restaurante' } },
      },
    });
    await invocar();

    expect(telegramSpy).not.toHaveBeenCalled();
  });
});
