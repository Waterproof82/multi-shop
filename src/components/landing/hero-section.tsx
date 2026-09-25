"use client";

import Link from "next/link";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface HeroSectionProps {
  contenido: Record<string, unknown>;
  empresaNombre: string;
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
    <section className="relative flex flex-col items-center justify-center gap-6 overflow-hidden px-4 py-24 text-center">
      {imagenUrl && (
        <div className="absolute inset-0 -z-10">
          <Image src={imagenUrl} alt="" fill sizes="100vw" className="object-cover" priority />
          <div className="absolute inset-0 bg-background/70" />
        </div>
      )}
      {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
      <h1 className="text-4xl font-bold text-foreground md:text-6xl">{titulo}</h1>
      {descripcion && <p className="max-w-2xl text-lg text-muted-foreground">{descripcion}</p>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/carta"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("viewMenu", language)}
        </Link>
        {ctaSecundariaTexto && ctaSecundariaUrl && (
          <a
            href={ctaSecundariaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border px-6 text-base font-semibold text-foreground hover:bg-muted/50"
          >
            {ctaSecundariaTexto}
          </a>
        )}
      </div>
      {horario && <p className="text-sm text-muted-foreground">{horario}</p>}
    </section>
  );
}
