/* Hallmark · genre: editorial · macrostructure: Photographic · theme: tenant (runtime --primary/--accent)
 * type: Playfair Display 400 (display) + Inter (body) · enrichment: none (fotos del tenant)
 * nav: N1a (solo 2 destinos reales) · footer: SiteFooter compartido · motion: cinta + color, sin movimiento espacial
 */
import { Fragment, type ReactNode } from "react";

// Primitivas visuales compartidas por las secciones de la landing.
// Estilo "fotografico editorial": la foto del tenant manda (a sangre, sin
// esquinas redondeadas ni sombras), el texto es anotacion. Titulares serif
// romanos, filetes finos en vez de tarjetas, botones rectos. Todos los colores
// salen de los tokens del tenant (primary / foreground / muted...), salvo los
// de WhatsApp, que son de marca (tokens --whatsapp-*).

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// Boton base: recto, sin sombra ni desplazamiento. El hover solo cambia color.
const btnBase = `inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-[3px] font-semibold tracking-[0.01em] transition-colors duration-200 ${focusRing}`;

// No usa el primary del tenant: si es verde, el boton se confundiria con WhatsApp.
export const landingBtnOscuro = `${btnBase} border border-foreground bg-foreground text-background hover:bg-foreground/85`;

// --whatsapp-strip y no --whatsapp: el verde brillante no da contraste AA con blanco.
export const landingBtnWhatsapp = `${btnBase} border border-whatsapp-strip bg-whatsapp-strip px-6 py-3 text-[15px] text-white hover:bg-whatsapp-strip/90`;

export const landingBtnGhost = `${btnBase} border border-foreground/30 bg-transparent px-6 py-3 text-[15px] text-foreground hover:border-foreground`;

// Enlace tipografico: subrayado fino que se engrosa al pasar el raton.
export const landingLinkArrow = `inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap text-sm font-semibold text-foreground underline decoration-primary decoration-1 underline-offset-[6px] transition-[text-decoration-thickness] duration-200 hover:decoration-2 ${focusRing}`;

export const landingH2 =
  "font-serif text-[clamp(32px,4.4vw,60px)] font-normal leading-[1.05] tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]";

export const landingPadX = "px-[clamp(20px,4vw,64px)]";

interface AvisoNuevaPestanaProps {
  /** Texto traducido: `t("opensInNewTab", language)`. */
  texto: string;
}

/**
 * Aviso solo para lectores de pantalla en enlaces `target="_blank"` (WCAG
 * 3.2.5 / G201): el cambio de contexto no debe pillar por sorpresa.
 */
export function AvisoNuevaPestana({ texto }: Readonly<AvisoNuevaPestanaProps>) {
  return <span className="sr-only"> {texto}</span>;
}

interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

// Antetitulo: versalitas pequenas, siempre ENCIMA del titular (nunca en columna aparte).
export function Eyebrow({ children, className = "" }: Readonly<EyebrowProps>) {
  return (
    <p className={`mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground ${className}`}>
      {children}
    </p>
  );
}

interface TituloResaltadoProps {
  texto: string;
  /** Clase del tramo resaltado (por defecto, color primario, sin cursiva). */
  acentoClassName?: string;
}

/**
 * Pinta un título donde los tramos entre asteriscos (`Una finca *canaria*`)
 * salen en color de acento. Se mantiene el `<em>` (enfasis semantico) pero en
 * redonda: la cursiva dentro de un titular es un tic de plantilla. Sin
 * asteriscos, el texto sale tal cual.
 */
export function TituloResaltado({ texto, acentoClassName = "not-italic text-primary" }: Readonly<TituloResaltadoProps>) {
  const partes = texto.split("*");
  return (
    <>
      {partes.map((parte, idx) => {
        const key = `${idx}-${parte}`;
        if (idx % 2 === 1 && parte) {
          return (
            <em key={key} className={acentoClassName}>
              {parte}
            </em>
          );
        }
        // Texto suelto, sin <span>: con un elemento por tramo, el calculo del
        // nombre accesible (aria-labelledby de la seccion) puede comerse el
        // espacio entre tramos ("Cocinade verdad").
        return <Fragment key={key}>{parte}</Fragment>;
      })}
    </>
  );
}

/** Título sin los asteriscos de resaltado (para `alt`, `aria-label`...). */
export function tituloPlano(texto: string): string {
  return texto.replaceAll("*", "");
}

export function whatsappUrl(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replaceAll(/\D/g, "");
  if (digitos.length < 6) return null;
  return `https://wa.me/${digitos}`;
}

/** `tel:` marcable: sin espacios ni separadores, conservando el `+` inicial. */
export function telHref(telefono: string): string {
  return `tel:${telefono.replaceAll(/[^\d+]/g, "")}`;
}

/** Muestra el teléfono sin el prefijo del país (ej: 34601396419 → 601396419). */
export function displayPhoneNumber(telefono: string): string {
  const digitos = telefono.replaceAll(/\D/g, "");
  if (digitos.startsWith("34")) return digitos.slice(2);
  return digitos;
}

export function mapsSearchUrl(direccion: string | null | undefined, nombre: string): string | null {
  if (!direccion) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nombre} ${direccion}`)}`;
}
