// src/lib/kit-caducidad/email-aviso-caducidad.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3c/R-M3.4: el email del cron SÍ es comercial (enlaza a la compra del
// recambio) — al contrario que los de M2b (`emails-avisos.ts`), que nunca
// lo son. Art. 20.1 (identificación comercial y del remitente) y 22.1
// (revocación, RFC 8058). Tono de `CLAUDE.md` (principio 2): abre con la
// necesidad, cierra con la solución preventiva, sin urgencia falsa ni vida
// útil en años.
import { createHash } from 'node:crypto';
import { escapeHtml } from '@/lib/html-utils';
import { urlPackRecambio } from './etiqueta-urls';
import type { ElementoConEstado } from './estado';
import type { Remitente } from './emails-avisos';

export interface DatosEmailAviso {
  serie: string;
  kitNombre: string;
  kitSlug: string | null;
  elementos: readonly ElementoConEstado[];
  /** D-M2b-11: identidad legal del titular — mismo tipo que M2b (nombre, NIF, dirección, email de revocación). */
  remitente: Remitente;
  baseUrl: string;
  /** Token de gestión (`baja_token`) — el pie enlaza a `{baseUrl}/kit/avisos/{token}`, igual que M2b. */
  token: string;
}

export interface ContenidoEmail {
  asunto: string;
  html: string;
  texto: string;
}

// DD10 de M2a (design.md): es-ES largo sobre UTC, para que el día impreso
// no se desplace según la zona horaria de quien renderiza.
function formatearFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

function asuntoDe(kitNombre: string, elementos: readonly ElementoConEstado[]): string {
  if (elementos.length === 1) {
    const [elemento] = elementos;
    return `Tu ${kitNombre}: ${elemento.consumible} caduca el ${formatearFecha(elemento.caducaEl)}`;
  }
  return `Tu ${kitNombre}: ${elementos.length} consumibles caducan pronto`;
}

function lineaElementoHtml(e: ElementoConEstado): string {
  const parte = e.parte ? ` (${escapeHtml(e.parte)})` : '';
  return `<li>${escapeHtml(e.consumible)}${parte}: caduca el ${formatearFecha(e.caducaEl)} — quedan ${e.diasRestantes} días</li>`;
}

function lineaElementoTexto(e: ElementoConEstado): string {
  const parte = e.parte ? ` (${e.parte})` : '';
  return `- ${e.consumible}${parte}: caduca el ${formatearFecha(e.caducaEl)} — quedan ${e.diasRestantes} días`;
}

function enlaceGestion(d: DatosEmailAviso): string {
  return `${d.baseUrl}/kit/avisos/${d.token}`;
}

// R-M3.4.5/art. 22.1: el enlace de gestión Y la frase "o escribe a
// {remitente.email}" — la misma doble vía de revocación que M2b.
function pieHtml(d: DatosEmailAviso, enlaceGestionUrl: string): string {
  const direccion = d.remitente.direccion ? ` — ${escapeHtml(d.remitente.direccion)}` : '';
  return `
    <p>¿No quieres más avisos? <a href="${enlaceGestionUrl}">Gestiona tus avisos</a> o escribe a
      <a href="mailto:${escapeHtml(d.remitente.email)}">${escapeHtml(d.remitente.email)}</a>.</p>
    <p style="color:#666;font-size:12px">${escapeHtml(d.remitente.nombre)} — NIF ${escapeHtml(d.remitente.nif)}${direccion}</p>
  `;
}

function pieTexto(d: DatosEmailAviso, enlaceGestionUrl: string): string {
  const direccion = d.remitente.direccion ? ` — ${d.remitente.direccion}` : '';
  return [
    '',
    `¿No quieres más avisos? Entra en ${enlaceGestionUrl} o escribe a ${d.remitente.email}.`,
    `${d.remitente.nombre} — NIF ${d.remitente.nif}${direccion}`,
  ].join('\n');
}

/**
 * R-M3.4: email comercial del aviso de caducidad. `complejidad <= 15`
 * (DD12): cada bloque (asunto, cuerpo, pie) sale de una función propia.
 */
export function emailAvisoCaducidad(d: DatosEmailAviso): ContenidoEmail {
  const asunto = asuntoDe(d.kitNombre, d.elementos);
  const serie = escapeHtml(d.serie);
  const marca = escapeHtml(d.remitente.nombre);
  const kitNombre = escapeHtml(d.kitNombre);
  const urlRecambio = urlPackRecambio(d.kitSlug);
  const enlaceGestionUrl = enlaceGestion(d);

  const necesidad = 'En una emergencia, tu kit tiene que funcionar desde el primer momento.';
  const solucion = 'Repón solo lo que caduca y tu kit sigue listo para cuando lo necesites.';

  const html = `
    <p>Comunicación comercial de ${marca}. Te escribimos porque pediste avisos de caducidad para tu kit <strong>${serie}</strong>.</p>
    <p>${necesidad}</p>
    <p>Esto es lo que caduca en tu <strong>${kitNombre}</strong>:</p>
    <ul>${d.elementos.map(lineaElementoHtml).join('')}</ul>
    <p>${solucion}</p>
    <p><a href="${urlRecambio}" style="display:inline-block;padding:12px 24px">Ver el pack de recambio</a></p>
    ${pieHtml(d, enlaceGestionUrl)}
  `;

  const texto = [
    `Comunicación comercial de ${d.remitente.nombre}. Te escribimos porque pediste avisos de caducidad para tu kit ${d.serie}.`,
    necesidad,
    `Esto es lo que caduca en tu ${d.kitNombre}:`,
    ...d.elementos.map(lineaElementoTexto),
    solucion,
    `Ver el pack de recambio: ${urlRecambio}`,
    pieTexto(d, enlaceGestionUrl),
  ].join('\n\n');

  return { asunto, html, texto };
}

/**
 * R-M3.4.6/RFC 8058: `List-Unsubscribe` lleva la URL de baja de un clic Y
 * el `mailto:` de revocación (art. 22.1, dos vías); `List-Unsubscribe-Post`
 * fija el valor que exige el RFC para que el cliente de correo haga el
 * `POST` sin preguntar.
 */
export function cabecerasBajaUnClic(urlBaja: string, emailRevocacion: string): Record<string, string> {
  const mailto = `mailto:${emailRevocacion}?subject=${encodeURIComponent('Baja avisos kit')}`;
  return {
    'List-Unsubscribe': `<${urlBaja}>, <${mailto}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * D-M3-6/R-M3.3.4: sha256 hex de las claves `marcar` ORDENADAS, para que el
 * mismo envío (mismo conjunto de avisos) tenga siempre la misma clave de
 * idempotencia sin que importe en qué orden se generaron.
 */
export function claveIdempotencia(marcar: readonly string[]): string {
  const ordenadas = [...marcar].sort();
  return createHash('sha256').update(ordenadas.join('|')).digest('hex');
}
