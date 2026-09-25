"use client";

import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";

interface TestimonioSectionProps {
  contenido: Record<string, unknown>;
}

export function TestimonioSection({ contenido }: Readonly<TestimonioSectionProps>) {
  const { language } = useLanguage();
  const texto = readTranslatable(contenido, "texto", language);
  const autor = readTranslatable(contenido, "autor", language);

  if (!texto) return null;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <blockquote className="text-xl italic leading-relaxed text-foreground">&ldquo;{texto}&rdquo;</blockquote>
      {autor && <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">— {autor}</p>}
    </section>
  );
}
