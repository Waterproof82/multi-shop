import { Result, AppError } from '@/core/domain/entities/types';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';

export interface RegisterManualMesaPaymentInput {
  mesaId:    string;
  empresaId: string;
  turnoId?:  string; // required when division_tipo === 'personalizado'
}

export interface RegisterManualMesaPaymentResult {
  pagosRealizados: number;
  personas: number | null;
  fullyPaid: boolean;
}

type Supabase = ReturnType<typeof getSupabaseClient>;

const METODO = 'registerManualMesaPaymentUseCase';

function fallo(code: string, message: string): AppError {
  return { code, message, module: 'use-case', method: METODO };
}

interface SesionActiva {
  id: string;
  empresaId: string;
  divisionPersonas: number | null;
  divisionTipo: string | null;
  customTurnoId: string | null;
}

/**
 * Sesión abierta de la mesa, ya validada.
 *
 * Las dos comprobaciones que hace son las que impiden un cobro indebido: que la
 * sesión sea de la empresa que pide el cobro —si no, el personal de un tenant
 * podría cerrar la mesa de otro— y que no estuviera ya pagada, que evita
 * contabilizar dos veces el mismo importe.
 */
async function cargarSesionCobrable(
  supabase: Supabase,
  mesaId: string,
  empresaId: string,
): Promise<Result<SesionActiva, AppError>> {
  const { data, error } = await supabase
    .from('mesa_sesiones')
    .select('id, empresa_id, division_personas, division_pagos_realizados, sesion_pagada, division_tipo, custom_turno_id')
    .eq('mesa_id', mesaId)
    .is('cerrada_at', null)
    .maybeSingle();

  if (error) return { success: false, error: fallo('DB_ERROR', 'Error al buscar sesión activa') };
  if (!data) return { success: false, error: fallo('NOT_FOUND', 'No hay sesión activa para esta mesa') };

  const s = data as Record<string, unknown>;
  if ((s['empresa_id'] as string) !== empresaId) {
    return { success: false, error: fallo('FORBIDDEN', 'Acceso denegado') };
  }
  if (s['sesion_pagada'] === true) {
    return { success: false, error: fallo('ALREADY_PAID', 'La sesión ya está pagada') };
  }

  return {
    success: true,
    data: {
      id: s['id'] as string,
      empresaId: s['empresa_id'] as string,
      divisionPersonas: s['division_personas'] as number | null,
      divisionTipo: s['division_tipo'] as string | null,
      customTurnoId: s['custom_turno_id'] as string | null,
    },
  };
}

/** Cuánto se ha cobrado y si la cuenta queda saldada. */
interface Cobro {
  pagosRealizados: number;
  fullyPaid: boolean;
}

/**
 * Cobro de un turno de la división a la carta.
 *
 * Son dos pasos encadenados en la base: `commit` pasa la selección a "en pago"
 * y crea las filas de `mesa_item_pagos`; `complete` la da por pagada y decide
 * si con eso la sesión queda cubierta. Si el primero falla no se ejecuta el
 * segundo — completar un turno cuya selección no se confirmó dejaría ítems
 * cobrados sin constancia de a quién.
 */
async function cobrarTurnoPersonalizado(
  supabase: Supabase,
  turnoId: string,
): Promise<Result<Cobro, AppError>> {
  const paymentOrderRef = `MANUAL-${turnoId.slice(0, 8)}-${Date.now()}`;

  const { data: commitResult, error: commitError } = await supabase.rpc('commit_custom_payment', {
    p_turno_id:          turnoId,
    p_payment_order_ref: paymentOrderRef,
    p_importe_cents:     0, // pago manual — el importe no lo lleva la RPC
  });
  if (commitError) {
    const appError = await logger.logAndReturnError('DB_ERROR', commitError.message, 'use-case', METODO, { details: { turnoId } });
    return { success: false, error: appError };
  }

  const commitRow = (commitResult as { success: boolean; error_code: string | null }[] | null)?.[0];
  if (!commitRow?.success) {
    const codigo = commitRow?.error_code ?? 'CONFLICT';
    return { success: false, error: fallo(codigo, commitRow?.error_code ?? 'Error al confirmar selección') };
  }

  const { data: completeResult, error: completeError } = await supabase.rpc('complete_custom_payment', {
    p_turno_id: turnoId,
  });
  if (completeError) {
    const appError = await logger.logAndReturnError('DB_ERROR', completeError.message, 'use-case', METODO, { details: { turnoId } });
    return { success: false, error: appError };
  }

  const completeRow = (completeResult as { success: boolean; sesion_completa: boolean; out_sesion_id: string | null }[] | null)?.[0];
  return { success: true, data: { pagosRealizados: 0, fullyPaid: completeRow?.sesion_completa ?? false } };
}

/** Cobro de un comensal en la división a partes iguales. */
async function cobrarParteIgual(supabase: Supabase, sesionId: string): Promise<Cobro> {
  // El contador lo lleva la base de forma atómica: calcularlo aquí abriría una
  // carrera entre dos camareros cobrando a la vez en dispositivos distintos.
  const { data } = await supabase.rpc('increment_division_pagos', { p_sesion_id: sesionId });
  const fila = (data as { pagos_realizados: number; personas: number }[] | null)?.[0];

  return {
    pagosRealizados: fila?.pagos_realizados ?? 0,
    fullyPaid: fila ? fila.pagos_realizados >= fila.personas : false,
  };
}

/** Aplica el cobro según cómo esté dividida la cuenta. */
async function aplicarCobro(
  supabase: Supabase,
  sesion: SesionActiva,
  turnoIdPedido: string | undefined,
): Promise<Result<Cobro, AppError>> {
  if (sesion.divisionTipo === 'personalizado') {
    const turnoId = turnoIdPedido ?? sesion.customTurnoId;
    // Sin turno en curso no hay selección que confirmar: el camarero está
    // cerrando la cuenta entera a mano.
    if (!turnoId) return { success: true, data: { pagosRealizados: 0, fullyPaid: true } };
    return cobrarTurnoPersonalizado(supabase, turnoId);
  }

  if (sesion.divisionPersonas != null) {
    return { success: true, data: await cobrarParteIgual(supabase, sesion.id) };
  }

  return { success: true, data: { pagosRealizados: 0, fullyPaid: true } };
}

/**
 * Cierra la sesión si quedó saldada; si no, se limita a soltar el bloqueo.
 *
 * Soltarlo importa incluso cuando aún falta gente por pagar: mientras
 * `pago_en_curso` siga puesto, el siguiente comensal no puede iniciar el suyo.
 */
async function asentarResultado(
  supabase: Supabase,
  sesion: SesionActiva,
  empresaId: string,
  fullyPaid: boolean,
): Promise<void> {
  if (fullyPaid) {
    await supabase
      .from('pedidos')
      .update({ payment_status: 'paid' })
      .eq('sesion_id', sesion.id)
      .eq('empresa_id', empresaId);
  }

  await supabase
    .from('mesa_sesiones')
    .update(fullyPaid
      ? { sesion_pagada: true, pago_en_curso: false, pago_iniciado_en: null }
      : { pago_en_curso: false, pago_iniciado_en: null })
    .eq('id', sesion.id);
}

/**
 * Registra un cobro hecho fuera de la pasarela: efectivo, datáfono propio, o el
 * camarero cerrando la cuenta a mano.
 */
export async function registerManualMesaPaymentUseCase(
  input: RegisterManualMesaPaymentInput
): Promise<Result<RegisterManualMesaPaymentResult>> {
  try {
    const supabase = getSupabaseClient();

    const sesion = await cargarSesionCobrable(supabase, input.mesaId, input.empresaId);
    if (!sesion.success) return { success: false, error: sesion.error };

    const cobro = await aplicarCobro(supabase, sesion.data, input.turnoId);
    if (!cobro.success) return { success: false, error: cobro.error };

    await asentarResultado(supabase, sesion.data, input.empresaId, cobro.data.fullyPaid);

    return {
      success: true,
      data: {
        pagosRealizados: cobro.data.pagosRealizados,
        personas: sesion.data.divisionPersonas,
        fullyPaid: cobro.data.fullyPaid,
      },
    };
  } catch (e) {
    const appError = await logger.logFromCatch(e, 'use-case', METODO, {
      details: { mesaId: input.mesaId },
    });
    return { success: false, error: appError };
  }
}
