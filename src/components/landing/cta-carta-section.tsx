"use client";

import { useId } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { AvisoNuevaPestana, Eyebrow, TituloResaltado, landingPadX } from "@/components/landing/landing-ui";

interface CtaCartaSectionProps {
  contenido: Record<string, unknown>;
}

const focusInvertido =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground";

export function CtaCartaSection({ contenido }: Readonly<CtaCartaSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;
  const tituloId = useId();

  // Region con nombre: su titulo si lo hay; si no, el texto del boton.
  // Banda a todo el ancho en tinta invertida, alineada a la izquierda: el
  // titular ocupa su columna y la accion se apoya abajo a la derecha.
  return (
    <section
      aria-labelledby={titulo ? tituloId : undefined}
      aria-label={titulo ? undefined : t("viewMenu", language)}
      className={`w-full bg-foreground py-[clamp(64px,10vw,144px)] text-background ${landingPadX}`}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-x-[clamp(32px,6vw,96px)] gap-y-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-end">
        <div className="min-w-0">
          {kicker && <Eyebrow className="!text-background/70">{kicker}</Eyebrow>}
          {titulo && (
            <h2
              id={tituloId}
              className="font-serif text-[clamp(40px,6.4vw,96px)] font-normal leading-[1] tracking-[-0.025em] [overflow-wrap:anywhere]"
            >
              <TituloResaltado texto={titulo} acentoClassName="not-italic text-background/60" />
            </h2>
          )}
        </div>
        <div className="min-w-0">
          {descripcion && (
            <p className="mb-8 max-w-[44ch] text-[clamp(16px,1.3vw,18px)] leading-[1.6] text-background/75">
              {descripcion}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/carta"
              className={`inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-[3px] border border-background bg-background px-6 py-3 text-[15px] font-semibold text-foreground transition-colors duration-200 hover:bg-background/85 ${focusInvertido}`}
            >
              {t("viewMenu", language)}
            </Link>
            {ctaSecundariaTexto && ctaSecundariaUrl && (
              <a
                href={ctaSecundariaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex min-h-[44px] items-center whitespace-nowrap text-sm font-semibold text-background underline decoration-background/50 decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-200 hover:decoration-background ${focusInvertido}`}
              >
                {ctaSecundariaTexto}
                <AvisoNuevaPestana texto={t("opensInNewTab", language)} />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
