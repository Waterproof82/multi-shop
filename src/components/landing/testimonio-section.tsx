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
      className="w-full px-[clamp(20px,4vw,64px)] py-[clamp(64px,10vw,140px)]"
    >
      {/* <figure> + <figcaption>: el autor va FUERA del <blockquote> (la cita
          es solo lo que se cita) y <cite> es para titulos de obras, no personas.
          Desplazada a la derecha del eje y con la comilla colgada en el margen. */}
      <figure className="mx-auto max-w-7xl border-t border-foreground/15 pt-[clamp(32px,5vw,64px)]">
        <div className="max-w-[52rem] lg:ml-[16%]">
          <blockquote className="relative">
            <span
              aria-hidden="true"
              className="absolute -left-[0.55em] top-0 font-serif text-[clamp(28px,3.4vw,48px)] leading-[1.2] text-primary"
            >
              &ldquo;
            </span>
            <p className="font-serif text-[clamp(26px,3.4vw,48px)] font-normal leading-[1.2] tracking-[-0.015em] text-foreground [overflow-wrap:anywhere]">
              {texto}
            </p>
          </blockquote>
          {autor && (
            <figcaption className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              — {autor}
            </figcaption>
          )}
        </div>
      </figure>
    </section>
  );
}
