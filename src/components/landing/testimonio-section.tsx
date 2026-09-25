"use client";

import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface TestimonioSectionProps {
  contenido: Record<string, unknown>;
}

export function TestimonioSection({ contenido }: Readonly<TestimonioSectionProps>) {
  const { language } = useLanguage();
  const texto = readTranslatable(contenido, "texto", language);
  const autor = readTranslatable(contenido, "autor", language);

  if (!texto) return null;

  return (
    <section
      aria-label={t("landingTestimonioLabel", language)}
      className="relative w-full bg-muted px-[clamp(20px,4vw,64px)] py-[clamp(80px,10vw,140px)] text-center"
    >
      {/* Filete superior degradado */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-0 h-px w-3/5 max-w-[600px] -translate-x-1/2 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"
      />
      {/* <figure> + <figcaption>: el autor va FUERA del <blockquote> (la cita
          es solo lo que se cita) y <cite> es para titulos de obras, no personas. */}
      <figure className="relative mx-auto max-w-[920px]">
        <span
          aria-hidden="true"
          className="mb-8 block font-serif text-[140px] font-light italic leading-[0.5] text-primary"
        >
          &ldquo;
        </span>
        <blockquote>
          <p className="mb-8 font-serif text-[clamp(26px,3.6vw,48px)] font-light italic leading-[1.2] tracking-[-0.015em] text-foreground">
            {texto}
          </p>
        </blockquote>
        {autor && (
          <figcaption className="text-[11px] font-semibold uppercase tracking-[0.32em] text-primary">
            — {autor}
          </figcaption>
        )}
      </figure>
    </section>
  );
}
