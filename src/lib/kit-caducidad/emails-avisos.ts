// src/lib/kit-caducidad/emails-avisos.ts
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// R-M2b.5: los dos emails (confirmación y gestión) NO son comerciales —
// nunca llevan enlace de compra ni promociones (R-M2b.5.1). Llevan
// remitente identificable (art. 20.1, R-M2b.5.2) y revocación (art. 22.1,
// R-M2b.5.3): el enlace de gestión Y la frase "o escribe a {email}".
import { escapeHtml } from '@/lib/html-utils';

/** DD8/D-M2b-11: identidad del titular legal para el pie del email. `null` bloquea el envío (503, R-M2b.2.8). */
export interface Remitente {
  nombre: string;
  nif: string;
  direccion: string | null;
  email: string;
}

interface TitularParaRemitente {
  nombre: string;
  nif: string | null;
  direccion: string | null;
  email: string | null;
}

/** `null` si falta el email o el NIF del titular — el alta no puede enviar un email sin remitente identificable ni revocación. */
export function remitenteDe(titular: TitularParaRemitente): Remitente | null {
  if (!titular.email || !titular.nif) return null;
  return { nombre: titular.nombre, nif: titular.nif, direccion: titular.direccion, email: titular.email };
}

export interface DatosEmailAvisos {
  serie: string;
  /** DD3: el mismo token sirve para confirmar y para la baja — un solo enlace en todo email. */
  token: string;
  baseUrl: string;
  remitente: Remitente;
}

export interface ContenidoEmail {
  asunto: string;
  html: string;
  texto: string;
}

function enlaceGestion(d: DatosEmailAvisos): string {
  return `${d.baseUrl}/kit/avisos/${d.token}`;
}

/** R-M2b.5.3: revocación — el enlace de gestión Y la frase "o escribe a {titular.email}" (art. 22.1). */
function pieRevocacionHtml(d: DatosEmailAvisos, enlace: string): string {
  const direccion = d.remitente.direccion ? ` — ${escapeHtml(d.remitente.direccion)}` : '';
  return `
    <p>¿No quieres estos avisos? <a href="${enlace}">Gestiona tus avisos</a> o escribe a
      <a href="mailto:${escapeHtml(d.remitente.email)}">${escapeHtml(d.remitente.email)}</a>.</p>
    <p style="color:#666;font-size:12px">${escapeHtml(d.remitente.nombre)} — NIF ${escapeHtml(d.remitente.nif)}${direccion}</p>
  `;
}

function pieRevocacionTexto(d: DatosEmailAvisos, enlace: string): string {
  const direccion = d.remitente.direccion ? ` — ${d.remitente.direccion}` : '';
  return [
    '',
    `¿No quieres estos avisos? Entra en ${enlace} o escribe a ${d.remitente.email}.`,
    `${d.remitente.nombre} — NIF ${d.remitente.nif}${direccion}`,
  ].join('\n');
}

/**
 * R-M2b.5.4: confirmación del alta — nombra la serie y recuerda QUÉ se ha
 * pedido (el núcleo de la casilla de email, R-M2b.1.3[1]: avisos 30 y 15
 * días antes), sin repetir la cláusula sobre el enlace de compra del
 * recambio — este email NO es comercial (R-M2b.5.1: nunca "comprar" ni
 * "pack-recambio"), aunque la casilla que se marcó sí la mencione. Avisa de
 * que el enlace caduca en 48 h (D-M2b-1, doble opt-in).
 */
export function emailConfirmacion(d: DatosEmailAvisos): ContenidoEmail {
  const enlace = enlaceGestion(d);
  const serie = escapeHtml(d.serie);
  const recordatorio = 'Has pedido recibir un aviso por email 30 y 15 días antes de que caduque algún consumible de tu kit.';

  const html = `
    <h1>Confirma tus avisos del kit</h1>
    <p>Has pedido avisos para el kit <strong>${serie}</strong>.</p>
    <p>${recordatorio}</p>
    <p><a href="${enlace}" style="display:inline-block;padding:12px 24px">Confirmar mis avisos</a></p>
    <p>El enlace caduca en 48 horas.</p>
    <p>Si no lo has pedido tú, ignora este email: no te escribiremos más.</p>
    ${pieRevocacionHtml(d, enlace)}
  `;

  const texto = [
    'Confirma tus avisos del kit',
    `Has pedido avisos para el kit ${d.serie}.`,
    recordatorio,
    `Confirmar mis avisos: ${enlace}`,
    'El enlace caduca en 48 horas.',
    'Si no lo has pedido tú, ignora este email: no te escribiremos más.',
    pieRevocacionTexto(d, enlace),
  ].join('\n\n');

  return { asunto: 'Confirma tus avisos del kit', html, texto };
}

const TEXTOS_GESTION: Record<'intento' | 'solicitud', { asunto: string; cuerpo: (serie: string) => string }> = {
  intento: {
    asunto: 'Alguien ha intentado registrar avisos para tu kit',
    cuerpo: (serie) => `Alguien ha intentado registrar avisos para tu kit ${serie}. No hemos cambiado nada.`,
  },
  solicitud: {
    asunto: 'Enlace para gestionar los avisos de tu kit',
    cuerpo: () => 'Aquí tienes el enlace para gestionar tus avisos.',
  },
};

/**
 * R-M2b.5.5: dos motivos — "intento" (alguien probó a registrar una serie
 * ya registrada, R-M2b.2.4) y "solicitud" (el titular pidió su enlace,
 * R-M2b.4.2). Ninguno de los dos cambia nada por sí solo: solo informan.
 */
export function emailGestion(d: DatosEmailAvisos, motivo: 'intento' | 'solicitud'): ContenidoEmail {
  const enlace = enlaceGestion(d);
  const { asunto, cuerpo } = TEXTOS_GESTION[motivo];
  const cuerpoTexto = cuerpo(d.serie);

  const html = `
    <h1>${escapeHtml(asunto)}</h1>
    <p>${escapeHtml(cuerpoTexto)}</p>
    <p><a href="${enlace}" style="display:inline-block;padding:12px 24px">Gestionar mis avisos</a></p>
    ${pieRevocacionHtml(d, enlace)}
  `;

  const texto = [asunto, cuerpoTexto, `Gestionar mis avisos: ${enlace}`, pieRevocacionTexto(d, enlace)].join('\n\n');

  return { asunto, html, texto };
}
