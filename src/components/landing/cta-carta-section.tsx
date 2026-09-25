"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface CtaCartaSectionProps {
  contenido: Record<string, unknown>;
}

export function CtaCartaSection({ contenido }: Readonly<CtaCartaSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
      {titulo && <h2 className="mb-4 text-2xl font-bold text-foreground">{titulo}</h2>}
      {descripcion && <p className="mb-6 text-base leading-relaxed text-muted-foreground">{descripcion}</p>}
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
    </section>
  );
}
