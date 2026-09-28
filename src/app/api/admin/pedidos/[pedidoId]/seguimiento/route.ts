import { NextRequest } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { getEmpresaUseCase, getPedidoUseCase } from '@/core/infrastructure/database';
import {
  resolveAdminContextWithEmpresa,
  successResponse,
  errorResponse,
  validationErrorResponse,
  handleResult,
} from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { NUMERO_SEGUIMIENTO_MAX } from '@/core/domain/constants/pedido';
import { resolverBaseUrl } from '@/lib/tgtg/campaign-email';
import {
  construirEmailSeguimiento,
  itemsParaEmail,
} from '@/core/infrastructure/services/seguimiento-email.builder';

/**
 * Número de seguimiento de un envío a domicilio.
 *
 *   PUT  → guarda el número (cadena vacía lo borra)
 *   GET  → vista previa del email (asunto, destinatario, HTML) para el popup
 *   POST → envía el email al cliente y registra cuándo
 *
 * GET y POST componen el correo con la MISMA función: lo que el admin ve en la
 * vista previa es exactamente lo que sale.
 */

interface Params {
  params: Promise<{ pedidoId: string }>;
}

const pedidoIdSchema = z.uuid();

const guardarSchema = z.object({
  numeroSeguimiento: z.string().max(NUMERO_SEGUIMIENTO_MAX),
});

async function leerPedidoId(params: Params['params']): Promise<string | null> {
  const { pedidoId } = await params;
  const parsed = pedidoIdSchema.safeParse(pedidoId);
  return parsed.success ? parsed.data : null;
}

export async function PUT(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const pedidoId = await leerPedidoId(params);
  if (!pedidoId) return validationErrorResponse('pedidoId inválido');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationErrorResponse('Invalid request body');
  }
  const parsed = guardarSchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error.issues[0].message);

  const result = await getPedidoUseCase().guardarNumeroSeguimiento(pedidoId, ctx.empresaId, parsed.data.numeroSeguimiento);
  if (!result.success) return handleResult(result);
  return successResponse({ numeroSeguimiento: parsed.data.numeroSeguimiento.trim() || null });
}

/** Compone el email a partir del pedido y la empresa. Compartido por GET y POST. */
async function componerEmail(request: NextRequest, pedidoId: string, empresaId: string) {
  const preparado = await getPedidoUseCase().prepararEmailSeguimiento(pedidoId, empresaId);
  if (!preparado.success) return { corte: handleResult(preparado) };

  const empresaResult = await getEmpresaUseCase().getById(empresaId);
  if (!empresaResult.success || !empresaResult.data) {
    return { corte: errorResponse('Empresa no encontrada', 404) };
  }
  const empresa = empresaResult.data;
  const { pedido, numeroSeguimiento, destinatario } = preparado.data;

  const email = construirEmailSeguimiento({
    empresaNombre: empresa.nombre || 'Tienda',
    empresaLogoUrl: empresa.logoUrl || '',
    primaryColor: empresa.colores?.primary || '#18181B',
    primaryForeground: empresa.colores?.primaryForeground || '#FFFFFF',
    baseUrl: resolverBaseUrl(empresa.dominio, new URL(request.url).origin),
    lang: pedido.clientes?.idioma || 'es',
    numeroPedido: pedido.numero_pedido,
    fechaPedido: pedido.created_at,
    numeroSeguimiento,
    clienteNombre: pedido.clientes?.nombre || null,
    direccionEntrega: pedido.direccion_entrega ?? null,
    modalidadNombre: pedido.modalidad_entrega_nombre ?? null,
    items: itemsParaEmail(pedido.detalle_pedido ?? []),
    gastosEnvioCents: pedido.modalidad_entrega_precio_cents ?? pedido.delivery_fee_cents ?? null,
    total: Number(pedido.total),
  });

  return {
    valor: {
      ...email,
      destinatario,
      senderName: empresa.nombre || 'Tienda',
      senderEmail: empresa.emailNotification || undefined,
    },
  };
}

export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const pedidoId = await leerPedidoId(params);
  if (!pedidoId) return validationErrorResponse('pedidoId inválido');

  try {
    const compuesto = await componerEmail(request, pedidoId, ctx.empresaId);
    if ('corte' in compuesto) return compuesto.corte;
    const { subject, html, destinatario } = compuesto.valor;
    return successResponse({ subject, html, destinatario });
  } catch (error) {
    await logApiError('Preview tracking email', error, 'GET');
    return errorResponse('Error interno', 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;

  const pedidoId = await leerPedidoId(params);
  if (!pedidoId) return validationErrorResponse('pedidoId inválido');

  try {
    const compuesto = await componerEmail(request, pedidoId, ctx.empresaId);
    if ('corte' in compuesto) return compuesto.corte;
    const { subject, html, text, destinatario, senderName, senderEmail } = compuesto.valor;

    await sendEmail({ to: destinatario, subject, htmlContent: html, textContent: text, senderName, senderEmail });

    // El correo ya salió: si falla solo el registro, no se devuelve error (el
    // admin reintentaría y el cliente recibiría el email dos veces).
    const marcado = await getPedidoUseCase().marcarEmailSeguimientoEnviado(pedidoId, ctx.empresaId);
    return successResponse({ enviadoAt: marcado.success ? marcado.data : new Date().toISOString() });
  } catch (error) {
    await logApiError('Send tracking email', error, 'POST');
    return errorResponse('No se pudo enviar el email', 502);
  }
}
