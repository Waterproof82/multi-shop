"use client";

import { useId } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { AvisoNuevaPestana, Eyebrow, TituloResaltado } from "@/components/landing/landing-ui";

interface CtaCartaSectionProps {
  contenido: Record<string, unknown>;
}

// Trama diagonal muy sutil sobre el panel oscuro (sustituye a la celosia jaali).
const TRAMA_PANEL = {
  backgroundImage:
    "repeating-linear-gradient(45deg, color-mix(in oklch, var(--background) 6%, transparent) 0 2px, transparent 2px 20px)",
};

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
  return (
    <section
      aria-labelledby={titulo ? tituloId : undefined}
      aria-label={titulo ? undefined : t("viewMenu", language)}
      className="relative mx-[clamp(20px,4vw,64px)] my-[clamp(40px,6vw,80px)] overflow-hidden rounded-[42px] bg-foreground px-[clamp(20px,4vw,64px)] py-[clamp(80px,11vw,160px)] text-center text-background">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={TRAMA_PANEL} />
      <span aria-hidden="true" className="absolute left-1/2 top-0 h-[60px] w-px -translate-x-1/2 bg-background/50" />

      <div className="relative z-[1] mx-auto max-w-[920px]">
        {kicker && <Eyebrow className="justify-center !text-background/80">{kicker}</Eyebrow>}
        {titulo && (
          <h2 id={tituloId} className="mb-7 font-serif text-[clamp(40px,7vw,96px)] font-bold leading-[1.05] tracking-[-0.01em]">
            <TituloResaltado texto={titulo} acentoClassName="italic text-background/70" />
          </h2>
        )}
        {descripcion && (
          <p className="mx-auto mb-11 max-w-[56ch] text-[clamp(16px,1.4vw,19px)] leading-[1.55] text-background/75">
            {descripcion}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3.5">
          <Link
            href="/carta"
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-background bg-background px-[30px] py-3 text-[15px] font-extrabold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
          >
            {t("viewMenu", language)}
          </Link>
          {ctaSecundariaTexto && ctaSecundariaUrl && (
            <a
              href={ctaSecundariaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-background/40 bg-transparent px-[30px] py-3 text-[15px] font-extrabold text-background transition-colors duration-200 hover:border-background hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
            >
              {ctaSecundariaTexto}
              <AvisoNuevaPestana texto={t("opensInNewTab", language)} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
