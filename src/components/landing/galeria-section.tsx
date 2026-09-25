"use client";

import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";

interface GaleriaSectionProps {
  contenido: Record<string, unknown>;
}

function imagenesValidas(contenido: Record<string, unknown>): string[] {
  if (!Array.isArray(contenido.imagenes)) return [];
  return contenido.imagenes.filter((url): url is string => typeof url === "string" && url.length > 0);
}

export function GaleriaSection({ contenido }: Readonly<GaleriaSectionProps>) {
  const { language } = useLanguage();
  const titulo = readTranslatable(contenido, "titulo", language);
  const imagenes = imagenesValidas(contenido);

  if (imagenes.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16">
      {titulo && <h2 className="mb-6 text-center text-2xl font-bold text-foreground">{titulo}</h2>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {imagenes.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative aspect-square overflow-hidden rounded-lg border border-border">
            <Image
              src={url}
              alt={`${t("landingGaleriaImagenAlt", language)} ${idx + 1}`}
              fill
              sizes="(max-width: 768px) 50vw, 33vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
