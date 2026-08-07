import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendEmail } from '@/lib/brevo-email';
import { deleteImageFromR2 } from '@/core/infrastructure/storage/s3-client';
import { getPromocionUseCase, getEmpresaUseCase } from '@/core/infrastructure/database';
import { resolveAdminContextWithEmpresa, errorResponse, handleResult } from '@/core/infrastructure/api/helpers';
import { logApiError } from '@/core/infrastructure/api/api-logger';
import { buildEmailHtml, PROMO_EMAIL_TEXTS, getLocaleForLang } from '@/core/infrastructure/services/promo-email.builder';
import { escapeHtml } from '@/lib/html-utils';
import { resolverBaseUrl } from '@/lib/tgtg/campaign-email';

const createPromocionSchema = z.object({
  texto_promocion: z.string().min(1, 'El texto de promoción es requerido').max(1000),
  imagen_url: z.url().refine(
    (url) => url.startsWith('https://'),
    { message: 'imagen_url must use HTTPS' }
  ).optional().nullable(),
  fecha_fin: z.iso.datetime({ offset: true }),
});

export async function GET(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  const result = await getPromocionUseCase().getAll(empresaId);
  if (!result.success) {
    return handleResult(result);
  }
  return NextResponse.json({ promociones: result.data });
}

type DestinatarioPromo = { email: string; idioma: string | null };

/** Empresa tal como la necesita el envío del boletín. */
type EmpresaPromo = NonNullable<
  Extract<Awaited<ReturnType<ReturnType<typeof getEmpresaUseCase>['getById']>>, { success: true }>['data']
>;

/** Tope de destinatarios por envío. Brevo cobra por correo y esto es un botón. */
const MAX_DESTINATARIOS = 500;

const ASUNTOS_PROMO: Record<string, string> = {
  es: 'Nueva promocion disponible',
  en: 'New promotion available',
  fr: 'Nouvelle promotion disponible',
  it: 'Nuova promozione disponibile',
  de: 'Neues Angebot verfugbar',
};

/**
 * Motivo por el que el boletín no puede salir, o `null` si puede.
 *
 * Ninguno de estos casos es un error de la petición: la promoción SÍ se creó, y
 * el admin recibe 200 con el motivo en `emailError`. Devolver un 4xx aquí le
 * haría pensar que no se guardó nada.
 */
function motivoParaNoEnviar(
  empresa: EmpresaPromo | null,
  destinatarios: DestinatarioPromo[],
  senderEmail: string | undefined,
): string | null {
  if (!empresa) return 'Empresa no encontrada';
  if (destinatarios.length === 0) return 'Sin clientes suscritos';
  if (destinatarios.length > MAX_DESTINATARIOS) {
    return `Demasiados destinatarios (${destinatarios.length}). Límite: ${MAX_DESTINATARIOS}`;
  }
  if (!senderEmail) return 'Email remitente no configurado (emailNotification o BREVO_DEFAULT_SENDER_EMAIL)';
  return null;
}

interface ContenidoPromo {
  empresaNombre: string;
  textoPromocion: string;
  fechaFin: string | null;
  baseUrl: string;
  empresaId: string;
  email: string;
  lang: string;
}

/**
 * Alternativa en texto plano. Quien bloquea HTML solo ve esto, así que lleva el
 * enlace a la web y el de baja: sin ellos el correo es un callejón sin salida.
 */
function construirTextoPlanoPromo(c: ContenidoPromo): string {
  const texts = PROMO_EMAIL_TEXTS[c.lang] || PROMO_EMAIL_TEXTS.es;
  const fechaFinLegible = c.fechaFin
    ? new Date(c.fechaFin).toLocaleDateString(getLocaleForLang(c.lang), { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const baja = new URLSearchParams({ email: c.email, empresa: c.empresaId, action: 'baja' });

  return [
    `${c.empresaNombre} — ${texts.title}`,
    '',
    c.textoPromocion,
    ...(fechaFinLegible ? ['', `${texts.validUntil}: ${fechaFinLegible}`] : []),
    '',
    `${texts.viewWebsite}: ${c.baseUrl}`,
    '',
    `${texts.unsubscribeLink}: ${c.baseUrl}/api/unsubscribe?${baja.toString()}`,
  ].join('\n');
}

interface ContextoEnvioPromo {
  empresa: EmpresaPromo;
  empresaId: string;
  senderEmail: string;
  baseUrl: string;
  textoPromocion: string;
  imagenUrl: string | null | undefined;
  fechaFin: string | null;
}

/**
 * Envía el boletín a cada suscriptor.
 *
 * Un rechazo puntual del servidor de correo no corta el bucle: el resto de la
 * lista debe recibirlo igual. Se guarda el primer error como aviso.
 */
async function enviarPromoACadaDestinatario(
  destinatarios: DestinatarioPromo[],
  ctx: ContextoEnvioPromo,
): Promise<{ emailsSent: number; emailError: string | null }> {
  const empresaNombre = ctx.empresa.nombre || 'Empresa';
  let emailsSent = 0;
  let emailError: string | null = null;

  for (const destinatario of destinatarios) {
    try {
      const lang = destinatario.idioma || 'es';

      await sendEmail({
        to: [destinatario.email],
        subject: ASUNTOS_PROMO[lang] || ASUNTOS_PROMO.es,
        htmlContent: buildEmailHtml({
          empresaLogoUrl: ctx.empresa.logoUrl || '',
          empresaNombre,
          textoEscapado: escapeHtml(ctx.textoPromocion),
          imagen_url: ctx.imagenUrl ?? undefined,
          fecha_fin: ctx.fechaFin,
          baseUrl: ctx.baseUrl,
          empresaId: ctx.empresaId,
          recipientEmail: destinatario.email,
          primaryColor: ctx.empresa.colores?.primary || '#7c3aed',
          primaryForeground: ctx.empresa.colores?.primaryForeground || '#FFFFFF',
          lang,
        }),
        textContent: construirTextoPlanoPromo({
          empresaNombre,
          textoPromocion: ctx.textoPromocion,
          fechaFin: ctx.fechaFin,
          baseUrl: ctx.baseUrl,
          empresaId: ctx.empresaId,
          email: destinatario.email,
          lang,
        }),
        senderName: empresaNombre,
        senderEmail: ctx.senderEmail,
      });
      emailsSent++;
    } catch (sendErr) {
      await logApiError('Send promo email failed', sendErr, 'POST');
      emailError ??= sendErr instanceof Error ? sendErr.message : 'Error al enviar email';
    }
  }

  return { emailsSent, emailError };
}

export async function POST(request: NextRequest) {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx.error;
  const { empresaId } = ctx;

  try {
    const empresaResult = await getEmpresaUseCase().getById(empresaId);
    if (!empresaResult.success) {
      return NextResponse.json({ error: empresaResult.error.message }, { status: 500 });
    }
    const empresa = empresaResult.data;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = createPromocionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const { texto_promocion, imagen_url, fecha_fin } = parsed.data;

    const createResult = await getPromocionUseCase().create(empresaId, texto_promocion, imagen_url, fecha_fin!);
    if (!createResult.success) {
      return NextResponse.json({ error: createResult.error.message }, { status: 500 });
    }

    const { promo, oldImageUrl, emailTargets } = createResult.data;
    if (oldImageUrl) await deleteImageFromR2(oldImageUrl);

    const senderEmail = empresa?.emailNotification || process.env.BREVO_DEFAULT_SENDER_EMAIL;
    const motivo = motivoParaNoEnviar(empresa, emailTargets, senderEmail);

    // La promoción ya está creada. Si el correo no puede salir, se informa en
    // `emailError` y se responde 200: un 4xx haría creer que no se guardó nada.
    const envio = motivo
      ? { emailsSent: 0, emailError: motivo }
      : await enviarPromoACadaDestinatario(emailTargets, {
          empresa: empresa!,
          empresaId,
          senderEmail: senderEmail!,
          // Mismo control que en la ruta de TGTG: el dominio acaba dentro de un
          // `href` del correo, así que se valida como hostname antes de usarlo.
          baseUrl: resolverBaseUrl(empresa!.dominio, new URL(request.url).origin),
          textoPromocion: texto_promocion,
          imagenUrl: imagen_url,
          fechaFin: fecha_fin ?? null,
        });

    if (envio.emailError) {
      await logApiError('Promo emails skipped', new Error(envio.emailError), 'POST');
    }

    return NextResponse.json({ promocion: promo, emailsSent: envio.emailsSent, emailError: envio.emailError });
  } catch (error) {
    await logApiError('Create promocion', error, 'POST');
    return errorResponse('Error interno');
  }
}
