import type { Pedido, Result } from '@/core/domain/entities/types';
import type { SendEmailParams } from '@/lib/brevo-email';
import { resolverBaseUrl } from '@/lib/tgtg/campaign-email';
import { logger } from '@/core/infrastructure/logging/logger';
import {
  construirEmailConfirmacion,
  tipoEntregaDelPedido,
} from '@/core/infrastructure/services/confirmacion-pedido-email.builder';
import { itemsParaEmail } from '@/core/infrastructure/services/seguimiento-email.builder';

export interface EmpresaParaEmail {
  nombre: string;
  logoUrl: string;
  primaryColor: string;
  primaryForeground: string;
  dominio: string | null;
  emailNotification: string | null;
}

export interface DepsConfirmacion {
  buscarPedido(id: string, empresaId: string): Promise<Result<Pedido | null>>;
  /** UPDATE condicionado a que no se haya enviado. `false` = otro camino ya lo reclamó. */
  reclamarEnvio(id: string, empresaId: string): Promise<Result<boolean>>;
  liberarEnvio(id: string, empresaId: string): Promise<Result<void>>;
  buscarEmpresa(empresaId: string): Promise<EmpresaParaEmail | null>;
  enviar(params: SendEmailParams): Promise<unknown>;
}

export interface EntradaConfirmacion {
  pedidoId: string;
  empresaId: string;
  /** Solo `true` cuando Redsys ha confirmado el cobro. */
  pagado: boolean;
  /** Origen de la petición, para los enlaces si el tenant no tiene dominio propio. */
  origen: string;
}

export type ResultadoConfirmacion = 'enviado' | 'sin_email' | 'ya_enviado' | 'no_aplica' | 'error';

function componer(pedido: Pedido, empresa: EmpresaParaEmail, entrada: EntradaConfirmacion) {
  const baseUrl = resolverBaseUrl(empresa.dominio, entrada.origen);
  return construirEmailConfirmacion({
    empresaNombre: empresa.nombre,
    empresaLogoUrl: empresa.logoUrl,
    primaryColor: empresa.primaryColor,
    primaryForeground: empresa.primaryForeground,
    baseUrl,
    lang: pedido.clientes?.idioma || 'es',
    numeroPedido: pedido.numero_pedido,
    fechaPedido: pedido.created_at,
    pagado: entrada.pagado,
    clienteNombre: pedido.clientes?.nombre || null,
    trackingUrl: pedido.tracking_token ? `${baseUrl}/tracking/${pedido.tracking_token}` : null,
    tipoEntrega: tipoEntregaDelPedido(pedido),
    modalidadNombre: pedido.modalidad_entrega_nombre ?? null,
    direccionEntrega: pedido.direccion_entrega ?? null,
    items: itemsParaEmail(pedido.detalle_pedido ?? []),
    gastosEnvioCents: pedido.modalidad_entrega_precio_cents ?? pedido.delivery_fee_cents ?? null,
    total: Number(pedido.total),
  });
}

/**
 * Email "hemos recibido tu pedido" al cliente. Nunca lanza: el pedido ya está
 * creado (o cobrado) y un fallo del correo no puede cambiar eso.
 *
 * Lo pueden disparar varios caminos para el mismo pedido (webhook de Redsys,
 * vuelta del navegador, reintentos idempotentes). Solo envía quien reclama
 * `confirmacion_email_enviado_at`; si el envío falla, se suelta.
 */
export function crearEnviarConfirmacionPedido(deps: DepsConfirmacion) {
  return async function enviarConfirmacionPedido(entrada: EntradaConfirmacion): Promise<ResultadoConfirmacion> {
    const { pedidoId, empresaId } = entrada;
    let reclamado = false;
    try {
      const leido = await deps.buscarPedido(pedidoId, empresaId);
      if (!leido.success) return 'error';
      const pedido = leido.data;
      if (pedido === null || pedido.mesa_id) return 'no_aplica';

      const destinatario = pedido.clientes?.email?.trim();
      if (!destinatario) return 'sin_email';

      const empresa = await deps.buscarEmpresa(empresaId);
      if (!empresa) return 'error';

      const reclamo = await deps.reclamarEnvio(pedidoId, empresaId);
      if (!reclamo.success) return 'error';
      if (!reclamo.data) return 'ya_enviado';
      reclamado = true;

      const email = componer(pedido, empresa, entrada);
      await deps.enviar({
        to: destinatario,
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        senderName: empresa.nombre,
        senderEmail: empresa.emailNotification || undefined,
      });
      return 'enviado';
    } catch (e) {
      if (reclamado) await deps.liberarEnvio(pedidoId, empresaId).catch(() => undefined);
      await logger.logFromCatch(e, 'use-case', 'enviarConfirmacionPedido', { empresaId, details: { pedidoId } });
      return 'error';
    }
  };
}
