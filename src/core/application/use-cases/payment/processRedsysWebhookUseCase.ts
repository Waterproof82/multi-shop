import { Result, AppError, Pedido } from '@/core/domain/entities/types';
import { verifyRedsysWebhook } from '@/core/infrastructure/services/redsys.service';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { logger } from '@/core/infrastructure/logging/logger';
import { createGlovoOrderUseCase } from '@/core/application/use-cases/glovo/createGlovoOrderUseCase';

export interface ProcessRedsysWebhookInput {
  dsParameters: string; // raw Base64 from POST body
  dsSignature: string; // raw signature from POST body
  dsSignatureVersion: string;
  empresaId: string;
}

export interface ProcessRedsysWebhookResult {
  verified: boolean;
  skipped?: boolean;
  paymentStatus?: 'paid' | 'failed';
}

type EstadoPago = 'paid' | 'failed';
type Supabase = ReturnType<typeof getSupabaseClient>;
type Salida = Result<ProcessRedsysWebhookResult, AppError>;

/** Respuesta a Redsys cuando no hay nada que procesar. Siempre HTTP 200. */
const noVerificado: Salida = { success: true, data: { verified: false } };

/**
 * Cuerpo del aviso: JSON en Base64.
 *
 * Devuelve `null` si viene ilegible o sin número de orden. Cualquiera de las dos
 * cosas significa que no se puede identificar el cobro, así que no hay nada que
 * hacer salvo responder 200 y olvidarlo.
 */
function decodificarParametros(dsParameters: string): { dsOrder: string; dsResponse?: string } | null {
  let params: Record<string, unknown>;
  try {
    params = JSON.parse(Buffer.from(dsParameters, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }

  const dsOrder = (params['Ds_Order'] as string | undefined) ?? (params['DS_MERCHANT_ORDER'] as string | undefined);
  if (!dsOrder) return null;

  return { dsOrder, dsResponse: params['Ds_Response'] as string | undefined };
}

interface DatosEmpresa {
  secretKey: string;
  telegramChatId: string | null;
  empresaTipo: string | null;
}

/** Empresa con clave de Redsys configurada, o `null` si no se puede verificar nada. */
async function cargarEmpresa(supabase: Supabase, empresaId: string): Promise<DatosEmpresa | null> {
  const { data, error } = await supabase
    .from('empresas')
    .select('redsys_secret_key, telegram_chat_id, tipo')
    .eq('id', empresaId)
    .single();

  if (error || !data) return null;

  const e = data as Record<string, unknown>;
  const secretKey = e['redsys_secret_key'] as string | null;
  if (!secretKey) return null;

  return {
    secretKey,
    telegramChatId: e['telegram_chat_id'] as string | null,
    empresaTipo: e['tipo'] as string | null,
  };
}

/**
 * Ds_Response 0000–0099 es autorización; cualquier otra cosa, rechazo.
 *
 * El valor por defecto '9999' NO es arbitrario: si el aviso llega sin código, lo
 * seguro es tratarlo como rechazo. Darlo por cobrado marcaría como pagado un
 * pedido que Redsys nunca confirmó.
 */
function estadoSegunRespuesta(dsResponse: string | undefined): EstadoPago {
  const num = Number.parseInt(dsResponse ?? '9999', 10);
  return num >= 0 && num <= 99 ? 'paid' : 'failed';
}

/** Marca como pagados todos los pedidos de la sesión y cierra la sesión. */
async function cerrarSesionPagada(supabase: Supabase, sesionId: string, empresaId: string): Promise<void> {
  await supabase.from('pedidos').update({ payment_status: 'paid' }).eq('sesion_id', sesionId).eq('empresa_id', empresaId);
  await supabase.from('mesa_sesiones').update({ sesion_pagada: true }).eq('id', sesionId);
}

/**
 * Suelta el bloqueo de cobro de la mesa.
 *
 * Se llama tanto si el pago sale bien como si se rechaza: si no se soltara, la
 * mesa quedaría con `pago_en_curso` y nadie podría pedir ni reintentar el cobro
 * hasta que el lock caducara solo.
 */
async function liberarBloqueoMesa(supabase: Supabase, sesionId: string): Promise<void> {
  await supabase
    .from('mesa_sesiones')
    .update({ pago_en_curso: false, pago_iniciado_en: null })
    .eq('id', sesionId);
}

/**
 * Camino 0 — turno de pago personalizado (`mesa_pagos_personalizados`).
 *
 * Devuelve `null` si la orden no es de este tipo, para que el flujo siga
 * probando los otros caminos.
 */
async function procesarTurnoPersonalizado(
  supabase: Supabase,
  dsOrder: string,
  estado: EstadoPago,
): Promise<Salida | null> {
  const { data } = await supabase
    .from('mesa_pagos_personalizados')
    .select('id, status, sesion_id, empresa_id')
    .eq('payment_order_ref', dsOrder)
    .maybeSingle();

  if (!data) return null;
  const turno = data as { id: string; status: string; sesion_id: string; empresa_id: string };

  // Idempotencia: Redsys reintenta sus avisos. Sin esta guarda, el segundo
  // volvería a completar el turno y a repartir el importe otra vez.
  if (turno.status !== 'en_pago') {
    return { success: true, data: { verified: true, skipped: true } };
  }

  if (estado === 'failed') {
    await supabase.rpc('cancel_custom_turn', { p_turno_id: turno.id });
    return { success: true, data: { verified: true, paymentStatus: estado } };
  }

  const { data: completeResult } = await supabase.rpc('complete_custom_payment', { p_turno_id: turno.id });
  const fila = (completeResult as { success: boolean; sesion_completa: boolean; out_sesion_id: string | null }[] | null)?.[0];
  if (fila?.sesion_completa && fila.out_sesion_id) {
    await cerrarSesionPagada(supabase, fila.out_sesion_id, turno.empresa_id);
  }

  return { success: true, data: { verified: true, paymentStatus: estado } };
}

/**
 * Camino 1 — pago por división de cuenta (`mesa_division_pagos`).
 *
 * Devuelve `null` si la orden no es de este tipo.
 */
async function procesarDivision(
  supabase: Supabase,
  dsOrder: string,
  estado: EstadoPago,
): Promise<Salida | null> {
  const { data } = await supabase
    .from('mesa_division_pagos')
    .select('id, sesion_id, empresa_id, status')
    .eq('payment_order_ref', dsOrder)
    .maybeSingle();

  if (!data) return null;
  const pago = data as { id: string; sesion_id: string; empresa_id: string; status: string };

  // Idempotencia ATÓMICA: se reclama la fila con un UPDATE condicionado a que
  // siga en 'pending'. Leer y luego escribir dejaría una ventana en la que dos
  // reintentos simultáneos pasan ambos la comprobación y cuentan el mismo pago
  // dos veces — la mesa se daría por saldada habiendo cobrado a uno menos.
  const { data: reclamada } = await supabase
    .from('mesa_division_pagos')
    .update({ status: estado === 'paid' ? 'paid' : 'failed' })
    .eq('id', pago.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (!reclamada) {
    return { success: true, data: { verified: true, skipped: true } };
  }

  if (estado === 'paid') {
    const { data: rpcResult } = await supabase.rpc('increment_division_pagos', { p_sesion_id: pago.sesion_id });
    const fila = (rpcResult as { pagos_realizados: number; personas: number }[] | null)?.[0];
    if (fila && fila.pagos_realizados >= fila.personas) {
      await cerrarSesionPagada(supabase, pago.sesion_id, pago.empresa_id);
    }
  }

  await liberarBloqueoMesa(supabase, pago.sesion_id);
  return { success: true, data: { verified: true, paymentStatus: estado } };
}

interface DatosCliente {
  nombre: string;
  telefono: string;
  email: string;
}

function leerCliente(p: Record<string, unknown>): DatosCliente {
  const cliente = (p['clientes'] as Record<string, unknown> | null) ?? {};
  return {
    nombre: (cliente['nombre'] as string | null) ?? 'Cliente',
    telefono: (cliente['telefono'] as string | null) ?? '',
    email: (cliente['email'] as string | null) ?? '',
  };
}

function construirPedidoParaTelegram(
  p: Record<string, unknown>,
  empresaId: string,
  cliente: DatosCliente,
): Pedido {
  const rawItems = p['detalle_pedido'] as { producto_id?: string; nombre: string; precio: number; cantidad: number }[] | null;
  return {
    id: p['id'] as string,
    empresa_id: empresaId,
    cliente_id: null,
    numero_pedido: (p['numero_pedido'] as number | null) ?? 0,
    detalle_pedido: (rawItems ?? []).map(item => ({
      producto_id: item.producto_id,
      nombre: item.nombre,
      precio: item.precio,
      cantidad: item.cantidad,
    })),
    total: (p['total'] as number | null) ?? 0,
    moneda: null,
    estado: 'pendiente',
    created_at: new Date().toISOString(),
    tracking_token: (p['tracking_token'] as string | null) ?? null,
    estimated_minutes: null,
    estimated_ready_at: null,
    clientes: { nombre: cliente.nombre, email: cliente.email, telefono: cliente.telefono },
  };
}

/**
 * Aviso a Telegram del pedido ya cobrado.
 *
 * Solo para recogida y tienda. Delivery lo cubre el despacho a Glovo, y los
 * pedidos de mesa los ve el personal en cocina/bar — avisar ahí sería ruido.
 */
async function notificarTelegram(
  supabase: Supabase,
  p: Record<string, unknown>,
  empresaId: string,
  telegramChatId: string,
  origen: string | null,
  empresaTipo: string | null,
  cliente: DatosCliente,
): Promise<void> {
  const esRecogida = origen === 'recogida';
  if (!esRecogida && empresaTipo !== 'tienda') return;

  const { sendTelegramWithInlineButtons, sendTelegramWithQuickReplies } =
    await import('@/core/infrastructure/services/telegram.service');

  const enviar = esRecogida ? sendTelegramWithInlineButtons : sendTelegramWithQuickReplies;
  const resultado = await enviar(construirPedidoParaTelegram(p, empresaId, cliente), telegramChatId);

  if (resultado.success) {
    await supabase
      .from('pedidos')
      .update({ telegram_message_id: resultado.data.messageId })
      .eq('id', p['id'] as string);
  }
}

/**
 * Despacho del reparto. Deliberadamente sin `await`: si Glovo tarda o falla, el
 * webhook ya ha hecho lo importante —dejar el pedido como pagado— y hacer
 * esperar a Redsys solo provocaría reintentos.
 */
function despacharGlovo(
  p: Record<string, unknown>,
  empresaId: string,
  dsOrder: string,
  cliente: DatosCliente,
): void {
  createGlovoOrderUseCase({
    empresaId,
    pedidoId: p['id'] as string,
    clientOrderId: (p['payment_order_ref'] as string | null) ?? dsOrder,
    recipientName: cliente.nombre,
    recipientPhone: cliente.telefono,
    recipientAddress: (p['direccion_entrega'] as string | null) ?? '',
    recipientLatitude: (p['latitude_entrega'] as number | null) ?? 0,
    recipientLongitude: (p['longitude_entrega'] as number | null) ?? 0,
    orderTotal: (p['total'] as number | null) ?? 0,
    orderDescription: `Pedido #${(p['numero_pedido'] as number | null) ?? 0}`,
  }).catch((err: unknown) => {
    logger.logFromCatch(err, 'use-case', 'processRedsysWebhookUseCase.glovoDispatch', { empresaId });
  });
}

/** Efectos posteriores al cobro: cerrar sesión de mesa, avisar, despachar. */
async function aplicarEfectosDelCobro(
  supabase: Supabase,
  p: Record<string, unknown>,
  input: ProcessRedsysWebhookInput,
  dsOrder: string,
  empresa: DatosEmpresa,
): Promise<void> {
  const cliente = leerCliente(p);
  const origen = (p['origen'] as string | null) ?? null;
  const sesionId = p['sesion_id'] as string | null;

  if (!sesionId && empresa.telegramChatId) {
    await notificarTelegram(supabase, p, input.empresaId, empresa.telegramChatId, origen, empresa.empresaTipo, cliente);
  }
  if (origen === 'delivery') {
    despacharGlovo(p, input.empresaId, dsOrder, cliente);
  }
}

/** Camino 2 — pago completo, localizado por `pedidos.payment_order_ref`. */
async function procesarPedidoCompleto(
  supabase: Supabase,
  input: ProcessRedsysWebhookInput,
  dsOrder: string,
  estado: EstadoPago,
  empresa: DatosEmpresa,
): Promise<Salida> {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, payment_status, empresa_id, total, numero_pedido, payment_order_ref, sesion_id, direccion_entrega, latitude_entrega, longitude_entrega, origen, detalle_pedido, tracking_token, clientes(nombre, telefono, email)')
    .eq('payment_order_ref', dsOrder)
    .eq('empresa_id', input.empresaId)
    .maybeSingle();

  // Orden desconocida: se verificó la firma, pero no hay pedido que actualizar.
  if (error || !data) return { success: true, data: { verified: true } };

  const p = data as Record<string, unknown>;

  // Idempotencia: si ya constaba pagado, este es un reintento de Redsys.
  if (p['payment_status'] === 'paid') {
    return { success: true, data: { verified: true, skipped: true } };
  }

  const { error: updateError } = await supabase
    .from('pedidos')
    .update({ payment_status: estado })
    .eq('id', p['id'] as string)
    .eq('empresa_id', input.empresaId);

  const sesionId = p['sesion_id'] as string | null;
  if (!updateError && sesionId && estado === 'paid') {
    await cerrarSesionPagada(supabase, sesionId, input.empresaId);
  }
  if (sesionId) {
    await liberarBloqueoMesa(supabase, sesionId);
  }

  if (updateError) {
    await logger.logAndReturnError(
      'DB_UPDATE_ERROR',
      updateError.message,
      'use-case',
      'processRedsysWebhookUseCase',
      { details: { code: updateError.code, pedidoId: p['id'] } }
    );
    return { success: true, data: { verified: true, paymentStatus: estado } };
  }

  if (estado === 'paid') {
    await aplicarEfectosDelCobro(supabase, p, input, dsOrder, empresa);
  }

  return { success: true, data: { verified: true, paymentStatus: estado } };
}

/**
 * Aviso de pago de Redsys.
 *
 * SIEMPRE responde 200: Redsys reintenta ante cualquier otra cosa, y un
 * reintento sobre un cobro ya aplicado es peor que un aviso perdido. Por eso
 * casi todos los caminos de fallo devuelven `verified: false` en vez de error.
 *
 * Tres tipos de cobro comparten este webhook, y se distinguen por dónde está
 * registrada la orden: turno personalizado, división de cuenta, o pedido
 * completo. Se prueban en ese orden.
 */
export async function processRedsysWebhookUseCase(
  input: ProcessRedsysWebhookInput
): Promise<Salida> {
  try {
    const supabase = getSupabaseClient();

    const params = decodificarParametros(input.dsParameters);
    if (!params) return noVerificado;

    const empresa = await cargarEmpresa(supabase, input.empresaId);
    if (!empresa) return noVerificado;

    if (!verifyRedsysWebhook(empresa.secretKey, input.dsParameters, input.dsSignature, params.dsOrder)) {
      return noVerificado;
    }

    const estado = estadoSegunRespuesta(params.dsResponse);

    return await procesarTurnoPersonalizado(supabase, params.dsOrder, estado)
      ?? await procesarDivision(supabase, params.dsOrder, estado)
      ?? await procesarPedidoCompleto(supabase, input, params.dsOrder, estado, empresa);
  } catch (e) {
    const appError = await logger.logFromCatch(
      e,
      'use-case',
      'processRedsysWebhookUseCase',
      { empresaId: input.empresaId }
    );
    return { success: false, error: appError };
  }
}
