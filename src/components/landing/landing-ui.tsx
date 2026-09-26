import { Fragment, type ReactNode } from "react";

// Primitivas visuales compartidas por las secciones de la landing.
// Estilo "mesón cálido": eyebrow en versalitas con filetes, titulares serif
// en negrita, botones tipo pastilla y esquinas muy redondeadas. Todos los
// colores salen de los tokens del tenant (primary / foreground / muted...),
// salvo los de WhatsApp, que son de marca (tokens --whatsapp-*).

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// Mismo lenguaje visual que el FAB del carrito (oscuro + aro). No usa el primary
// del tenant: si es verde, el boton se confundiria con WhatsApp.
export const landingBtnOscuro = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-foreground font-extrabold text-background ring-2 ring-background shadow-[0_10px_26px_-6px_color-mix(in_oklch,var(--foreground)_45%,transparent)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 motion-reduce:hover:translate-y-0 ${focusRing}`;

// --whatsapp-strip y no --whatsapp: el verde brillante no da contraste AA con blanco.
export const landingBtnWhatsapp = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-whatsapp bg-whatsapp-strip px-[30px] py-3 text-[15px] font-extrabold text-white transition-transform duration-200 hover:-translate-y-0.5 active:scale-95 motion-reduce:hover:translate-y-0 ${focusRing}`;

export const landingBtnGhost = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-2 border-foreground bg-transparent px-[30px] py-3 text-[15px] font-extrabold text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background ${focusRing}`;

export const landingLinkArrow = `inline-flex min-h-[44px] items-center gap-2 border-b-2 border-current pb-1 text-sm font-extrabold tracking-[0.01em] text-primary transition-[gap] duration-200 hover:gap-3.5 ${focusRing}`;

export const landingH2 =
  "font-serif text-[clamp(32px,4.4vw,56px)] font-bold leading-[1.1] tracking-[-0.01em] text-foreground";

// Sombra cálida "flotante" de fotos y paneles, derivada del color de texto.
export const landingShadowSoft =
  "shadow-[0_22px_48px_-24px_color-mix(in_oklch,var(--foreground)_50%,transparent)]";

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
  /** Sin filetes laterales (encabezados alineados a la izquierda). */
  solo?: boolean;
  className?: string;
}

export function Eyebrow({ children, solo = false, className = "" }: Readonly<EyebrowProps>) {
  const filetes = solo
    ? ""
    : "before:h-px before:w-7 before:bg-current before:opacity-50 before:content-[''] after:h-px after:w-7 after:bg-current after:opacity-50 after:content-['']";
  return (
    <p
      className={`mb-[18px] inline-flex items-center gap-3.5 text-xs font-extrabold uppercase tracking-[0.14em] text-primary ${filetes} ${className}`}
    >
      {children}
    </p>
  );
}

interface TituloResaltadoProps {
  texto: string;
  /** Clase del tramo resaltado (por defecto, cursiva en color primario). */
  acentoClassName?: string;
}

/**
 * Pinta un título donde los tramos entre asteriscos (`Una finca *canaria*`)
 * salen en cursiva y color de acento, como el `<em>` de los titulares de la
 * referencia. Sin asteriscos, el texto sale tal cual.
 */
export function TituloResaltado({ texto, acentoClassName = "italic text-primary" }: Readonly<TituloResaltadoProps>) {
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

export function mapsSearchUrl(direccion: string | null | undefined, nombre: string): string | null {
  if (!direccion) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nombre} ${direccion}`)}`;
}
