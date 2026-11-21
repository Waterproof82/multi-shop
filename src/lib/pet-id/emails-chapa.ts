// src/lib/pet-id/emails-chapa.ts
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 10/DD17: dos emails NO comerciales — confirmación del alta e
// "intento" (alguien probó a activar una chapa ya activa) — en los 5
// idiomas soportados (R-QR.6.4: "los emails al dueño se escriben en el
// idioma elegido en el alta"). "Enfoque técnico" de design.md: los puertos
// (`EmailKitAvisos`, `Programar`) se reutilizan TAL CUAL de
// `kit-avisos-types.ts`; esta capa reutiliza también `remitenteDe` y
// `Remitente` de `kit-caducidad/emails-avisos.ts` — solo construye el
// CONTENIDO (asunto/html/texto), nunca el envío. Ningún email lleva un
// enlace de compra ni "producto"/"comprar"/"pack-"
// (`tests/pet-id/emails-chapa.test.ts`).
import { escapeHtml } from '@/lib/html-utils';
import type { Remitente, ContenidoEmail } from '@/lib/kit-caducidad/emails-avisos';
import type { Language } from '@/lib/language-context';

export interface DatosEmailChapa {
  nombre: string;
  codigo: string;
  /** DD4/R-QR.5: el mismo token sirve para confirmar y para gestionar — un solo enlace en todo email. */
  token: string;
  baseUrl: string;
  remitente: Remitente;
  idioma: Language;
}

function enlaceGestion(d: DatosEmailChapa): string {
  return `${d.baseUrl}/m/gestion/${d.token}`;
}

interface TextosRevocacion {
  gestionaPrefijo: string;
  gestionaEnlace: string;
  oEscribeA: string;
}

/** Pie común a los dos emails: el enlace de gestión Y "o escribe a {titular.email}" (art. 22.1, calco de `pieRevocacionHtml`/`Texto` de M2b). */
const TEXTOS_REVOCACION: Record<Language, TextosRevocacion> = {
  es: { gestionaPrefijo: '¿Quieres gestionar el perfil de tu mascota?', gestionaEnlace: 'Entra aquí', oEscribeA: 'o escribe a' },
  en: { gestionaPrefijo: 'Want to manage your pet’s profile?', gestionaEnlace: 'Go here', oEscribeA: 'or write to' },
  fr: { gestionaPrefijo: 'Vous voulez gérer le profil de votre animal ?', gestionaEnlace: 'Cliquez ici', oEscribeA: 'ou écrivez à' },
  it: { gestionaPrefijo: 'Vuoi gestire il profilo del tuo animale?', gestionaEnlace: 'Entra qui', oEscribeA: 'oppure scrivi a' },
  de: { gestionaPrefijo: 'Möchten Sie das Profil Ihres Haustieres verwalten?', gestionaEnlace: 'Hier geht’s', oEscribeA: 'oder schreiben Sie an' },
};

function pieRevocacionHtml(d: DatosEmailChapa, enlace: string): string {
  const t = TEXTOS_REVOCACION[d.idioma];
  const direccion = d.remitente.direccion ? ` — ${escapeHtml(d.remitente.direccion)}` : '';
  return `
    <p>${t.gestionaPrefijo} <a href="${enlace}">${t.gestionaEnlace}</a> ${t.oEscribeA}
      <a href="mailto:${escapeHtml(d.remitente.email)}">${escapeHtml(d.remitente.email)}</a>.</p>
    <p style="color:#666;font-size:12px">${escapeHtml(d.remitente.nombre)} — NIF ${escapeHtml(d.remitente.nif)}${direccion}</p>
  `;
}

function pieRevocacionTexto(d: DatosEmailChapa, enlace: string): string {
  const t = TEXTOS_REVOCACION[d.idioma];
  const direccion = d.remitente.direccion ? ` — ${d.remitente.direccion}` : '';
  return [
    '',
    `${t.gestionaPrefijo} ${enlace} ${t.oEscribeA} ${d.remitente.email}.`,
    `${d.remitente.nombre} — NIF ${d.remitente.nif}${direccion}`,
  ].join('\n');
}

interface TextosConfirmacion {
  asunto: string;
  titulo: string;
  intro: (nombre: string) => string;
  botonConfirmar: string;
  caduca: string;
  ignora: string;
}

/** R-QR.4.1/DD6: confirma el alta — nombra la mascota y avisa de que caduca en 48 h (doble opt-in). */
const TEXTOS_CONFIRMACION: Record<Language, TextosConfirmacion> = {
  es: {
    asunto: 'Confirma el perfil de tu mascota',
    titulo: 'Confirma el perfil de tu mascota',
    intro: (nombre) => `Has pedido activar el perfil público de ${nombre}.`,
    botonConfirmar: 'Confirmar el perfil',
    caduca: 'El enlace caduca en 48 horas.',
    ignora: 'Si no lo has pedido tú, ignora este email: no te escribiremos más.',
  },
  en: {
    asunto: 'Confirm your pet’s profile',
    titulo: 'Confirm your pet’s profile',
    intro: (nombre) => `You’ve asked to activate ${nombre}’s public profile.`,
    botonConfirmar: 'Confirm the profile',
    caduca: 'This link expires in 48 hours.',
    ignora: 'If you didn’t request this, ignore this email: we won’t write to you again.',
  },
  fr: {
    asunto: 'Confirmez le profil de votre animal',
    titulo: 'Confirmez le profil de votre animal',
    intro: (nombre) => `Vous avez demandé l’activation du profil public de ${nombre}.`,
    botonConfirmar: 'Confirmer le profil',
    caduca: 'Ce lien expire dans 48 heures.',
    ignora: "Si ce n'est pas vous, ignorez cet email : nous ne vous écrirons plus.",
  },
  it: {
    asunto: 'Confirma il profilo del tuo animale',
    titulo: 'Confirma il profilo del tuo animale',
    intro: (nombre) => `Hai richiesto di attivare il profilo pubblico di ${nombre}.`,
    botonConfirmar: 'Conferma il profilo',
    caduca: 'Il link scade in 48 ore.',
    ignora: 'Se non sei stato tu, ignora questa email: non ti scriveremo più.',
  },
  de: {
    asunto: 'Bestätigen Sie das Profil Ihres Haustieres',
    titulo: 'Bestätigen Sie das Profil Ihres Haustieres',
    intro: (nombre) => `Sie haben die Aktivierung des öffentlichen Profils von ${nombre} angefordert.`,
    botonConfirmar: 'Profil bestätigen',
    caduca: 'Dieser Link läuft in 48 Stunden ab.',
    ignora: 'Wenn Sie das nicht waren, ignorieren Sie diese E-Mail: Wir schreiben Ihnen nicht erneut.',
  },
};

/**
 * R-QR.4.1/DD6/DD17: email de confirmación del alta. Sin enlace de compra;
 * lleva el titular, el NIF y la dirección del remitente (art. 20.1) y el
 * enlace de gestión (art. 22.1).
 */
export function emailConfirmacionChapa(d: DatosEmailChapa): ContenidoEmail {
  const t = TEXTOS_CONFIRMACION[d.idioma];
  const enlace = enlaceGestion(d);
  const nombre = escapeHtml(d.nombre);

  const html = `
    <h1>${t.titulo}</h1>
    <p>${t.intro(nombre)}</p>
    <p><a href="${enlace}" style="display:inline-block;padding:12px 24px">${t.botonConfirmar}</a></p>
    <p>${t.caduca}</p>
    <p>${t.ignora}</p>
    ${pieRevocacionHtml(d, enlace)}
  `;

  const texto = [
    t.titulo,
    t.intro(d.nombre),
    `${t.botonConfirmar}: ${enlace}`,
    t.caduca,
    t.ignora,
    pieRevocacionTexto(d, enlace),
  ].join('\n\n');

  return { asunto: t.asunto, html, texto };
}

interface TextosIntento {
  asunto: string;
  titulo: string;
  intro: (nombre: string) => string;
  noHemosCambiadoNada: string;
  botonGestionar: string;
}

/** R-QR.4.4: alguien ha intentado activar una chapa ya activa — no se cambia nada, pero se avisa al dueño actual. */
const TEXTOS_INTENTO: Record<Language, TextosIntento> = {
  es: {
    asunto: 'Alguien ha intentado activar la chapa de tu mascota',
    titulo: 'Alguien ha intentado activar la chapa de tu mascota',
    intro: (nombre) => `Alguien ha intentado activar la chapa de ${nombre}. No hemos cambiado nada.`,
    noHemosCambiadoNada: 'Si fuiste tú, aquí tienes el enlace para gestionar su perfil.',
    botonGestionar: 'Gestionar el perfil',
  },
  en: {
    asunto: 'Someone tried to activate your pet’s tag',
    titulo: 'Someone tried to activate your pet’s tag',
    intro: (nombre) => `Someone tried to activate ${nombre}’s tag. We haven’t changed anything.`,
    noHemosCambiadoNada: 'If it was you, here’s the link to manage the profile.',
    botonGestionar: 'Manage the profile',
  },
  fr: {
    asunto: 'Quelqu’un a tenté d’activer la plaque de votre animal',
    titulo: 'Quelqu’un a tenté d’activer la plaque de votre animal',
    intro: (nombre) => `Quelqu’un a tenté d’activer la plaque de ${nombre}. Nous n’avons rien changé.`,
    noHemosCambiadoNada: 'Si c’était vous, voici le lien pour gérer le profil.',
    botonGestionar: 'Gérer le profil',
  },
  it: {
    asunto: 'Qualcuno ha provato ad attivare la targhetta del tuo animale',
    titulo: 'Qualcuno ha provato ad attivare la targhetta del tuo animale',
    intro: (nombre) => `Qualcuno ha provato ad attivare la targhetta di ${nombre}. Non abbiamo cambiato nulla.`,
    noHemosCambiadoNada: 'Se sei stato tu, ecco il link per gestire il profilo.',
    botonGestionar: 'Gestisci il profilo',
  },
  de: {
    asunto: 'Jemand hat versucht, die Marke Ihres Haustieres zu aktivieren',
    titulo: 'Jemand hat versucht, die Marke Ihres Haustieres zu aktivieren',
    intro: (nombre) => `Jemand hat versucht, die Marke von ${nombre} zu aktivieren. Wir haben nichts geändert.`,
    noHemosCambiadoNada: 'Falls das Sie waren, hier ist der Link zur Verwaltung des Profils.',
    botonGestionar: 'Profil verwalten',
  },
};

/** R-QR.4.4/DD5: se envía al email YA REGISTRADO del dueño, nunca al que llegó en la petición que disparó el intento. */
export function emailIntentoAlta(d: DatosEmailChapa): ContenidoEmail {
  const t = TEXTOS_INTENTO[d.idioma];
  const enlace = enlaceGestion(d);
  const nombre = escapeHtml(d.nombre);

  const html = `
    <h1>${t.titulo}</h1>
    <p>${t.intro(nombre)}</p>
    <p>${t.noHemosCambiadoNada}</p>
    <p><a href="${enlace}" style="display:inline-block;padding:12px 24px">${t.botonGestionar}</a></p>
    ${pieRevocacionHtml(d, enlace)}
  `;

  const texto = [t.titulo, t.intro(d.nombre), t.noHemosCambiadoNada, `${t.botonGestionar}: ${enlace}`, pieRevocacionTexto(d, enlace)].join(
    '\n\n',
  );

  return { asunto: t.asunto, html, texto };
}
