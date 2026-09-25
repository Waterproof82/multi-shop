"use client";

import Link from "next/link";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { Eyebrow, landingBtnGhost, landingBtnPrimary } from "@/components/landing/landing-ui";

interface HeroSectionProps {
  contenido: Record<string, unknown>;
  empresaNombre: string;
}

function gridClass(conImagen: boolean): string {
  if (conImagen) return "lg:grid-cols-[1fr_1.1fr]";
  return "mx-auto max-w-4xl";
}

export function HeroSection({ contenido, empresaNombre }: Readonly<HeroSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? empresaNombre;
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;
  const horario = readTranslatable(contenido, "horario", language);

  return (
    <section
      className={`grid w-full items-stretch gap-[clamp(16px,2.4vw,30px)] p-[clamp(16px,2.4vw,30px)] ${gridClass(imagenUrl !== null)}`}
    >
      {imagenUrl && (
        <div className="relative h-[50vh] overflow-hidden rounded-[42px] shadow-[0_22px_48px_-24px_color-mix(in_oklch,var(--foreground)_50%,transparent)] lg:h-auto lg:min-h-[62vh]">
          <Image src={imagenUrl} alt="" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" priority />
        </div>
      )}

      <div className="flex flex-col justify-center p-[clamp(24px,4vw,60px)]">
        {kicker && <Eyebrow>{kicker}</Eyebrow>}
        <h1 className="mb-7 font-serif text-[clamp(40px,6.4vw,96px)] font-bold leading-[1.05] tracking-[-0.01em] text-foreground">
          {titulo}
        </h1>
        {descripcion && (
          <p className="mb-9 max-w-[46ch] text-[clamp(16px,1.4vw,19px)] leading-[1.55] text-muted-foreground">
            {descripcion}
          </p>
        )}
        <div className="mb-6 flex flex-wrap gap-3">
          <Link href="/carta" className={landingBtnPrimary}>
            {t("viewMenu", language)}
          </Link>
          {ctaSecundariaTexto && ctaSecundariaUrl && (
            <a href={ctaSecundariaUrl} target="_blank" rel="noopener noreferrer" className={landingBtnGhost}>
              {ctaSecundariaTexto}
            </a>
          )}
        </div>
        {horario && (
          <div className="mt-4 flex flex-col gap-1 border-t border-border pt-8 text-sm text-muted-foreground">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
              {t("landingHours", language)}
            </span>
            <em className="not-italic">{horario}</em>
          </div>
        )}
      </div>
    </section>
  );
}
