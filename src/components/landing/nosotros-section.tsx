"use client";

import { useId } from "react";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import {
  Eyebrow,
  TituloResaltado,
  landingH2,
  landingLinkArrow,
  landingShadowSoft,
  tituloPlano,
} from "@/components/landing/landing-ui";

interface NosotrosSectionProps {
  contenido: Record<string, unknown>;
  /** Muestra el enlace "Cómo llegar" hacia la sección Visítanos. */
  mostrarComoLlegar: boolean;
}

function gridClass(conImagen: boolean): string {
  if (conImagen) return "lg:grid-cols-[1fr_1.05fr]";
  return "max-w-3xl";
}

export function NosotrosSection({ contenido, mostrarComoLlegar }: Readonly<NosotrosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavAboutUs", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;
  const tituloId = useId();

  return (
    <section id="nosotros" aria-labelledby={tituloId} className="w-full scroll-mt-20 px-[clamp(20px,4vw,64px)] py-[clamp(56px,8vw,110px)]">
      <div
        className={`mx-auto grid max-w-7xl items-center gap-[clamp(36px,6vw,84px)] ${gridClass(imagenUrl !== null)}`}
      >
        {imagenUrl && (
          <div className="relative isolate mx-auto w-full max-w-[min(440px,82vw)] lg:max-w-[560px]">
            {/* Marco desplazado detras de la foto */}
            <span
              aria-hidden="true"
              className="absolute -left-3.5 -top-3.5 bottom-6 right-6 -z-10 rounded-[26px] border-2 border-primary"
            />
            <div className={`relative aspect-[4/5] overflow-hidden rounded-[26px] bg-card ${landingShadowSoft}`}>
              <Image
                src={imagenUrl}
                alt={tituloPlano(titulo)}
                fill
                sizes="(max-width: 1024px) 82vw, 560px"
                className="object-cover"
                loading="lazy"
              />
            </div>
          </div>
        )}
        <div>
          {kicker && <Eyebrow solo>{kicker}</Eyebrow>}
          <h2 id={tituloId} className={`${landingH2} mb-5 mt-1.5`}>
            <TituloResaltado texto={titulo} />
          </h2>
          {descripcion && (
            <p className="mb-4 max-w-[48ch] whitespace-pre-line text-[17px] leading-[1.7] text-muted-foreground">
              {descripcion}
            </p>
          )}
          {mostrarComoLlegar && (
            <a href="#donde-estamos" className={`${landingLinkArrow} mt-2`}>
              {t("landingHowToGetThere", language)}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
