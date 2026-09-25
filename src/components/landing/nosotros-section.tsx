"use client";

import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface NosotrosSectionProps {
  contenido: Record<string, unknown>;
}

export function NosotrosSection({ contenido }: Readonly<NosotrosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavAboutUs", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;

  return (
    <section id="nosotros" className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
      <div className="space-y-4">
        {kicker && <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{kicker}</p>}
        <h2 className="text-2xl font-bold text-foreground">{titulo}</h2>
        {descripcion && <p className="text-base leading-relaxed text-muted-foreground">{descripcion}</p>}
      </div>
      {imagenUrl && (
        <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
          <Image src={imagenUrl} alt={titulo} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" loading="lazy" />
        </div>
      )}
    </section>
  );
}
