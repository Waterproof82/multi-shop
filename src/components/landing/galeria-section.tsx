"use client";

import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { landingH2 } from "@/components/landing/landing-ui";

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
    <section className="mx-auto w-full max-w-7xl px-[clamp(20px,4vw,64px)] py-[clamp(56px,8vw,110px)]">
      {titulo && <h2 className={`${landingH2} mb-[38px] max-w-[46ch]`}>{titulo}</h2>}
      <div className="grid grid-cols-2 gap-3.5 min-[900px]:grid-cols-4">
        {imagenes.map((url, idx) => (
          <figure
            key={`${url}-${idx}`}
            className="group relative m-0 aspect-[3/4] overflow-hidden rounded-[26px] shadow-[0_2px_10px_color-mix(in_oklch,var(--foreground)_8%,transparent)]"
          >
            <Image
              src={url}
              alt={`${t("landingGaleriaImagenAlt", language)} ${idx + 1}`}
              fill
              sizes="(max-width: 900px) 50vw, 25vw"
              className="object-cover transition-transform duration-[600ms] ease-out group-hover:scale-105"
              loading="lazy"
            />
          </figure>
        ))}
      </div>
    </section>
  );
}
