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
  landingPadX,
  tituloPlano,
} from "@/components/landing/landing-ui";

interface NosotrosSectionProps {
  contenido: Record<string, unknown>;
  /** Muestra el enlace "Cómo llegar" hacia la sección Visítanos. */
  mostrarComoLlegar: boolean;
}

// Con foto: diptico, la foto toca el borde izquierdo de la pantalla y el texto
// queda en una columna estrecha. Sin foto: solo la columna de texto.
function gridClass(conImagen: boolean): string {
  if (conImagen) return "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]";
  return "mx-auto max-w-7xl";
}

// Junto a la foto, el hueco del grid ya separa: sin padding izquierdo extra.
function textoPadClass(conImagen: boolean): string {
  if (conImagen) return "lg:pl-0";
  return "";
}

export function NosotrosSection({ contenido, mostrarComoLlegar }: Readonly<NosotrosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavAboutUs", language);
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;
  const tituloId = useId();

  return (
    <section id="nosotros" aria-labelledby={tituloId} className="w-full scroll-mt-20 py-[clamp(56px,9vw,128px)]">
      <div className={`grid grid-cols-1 items-center gap-[clamp(32px,6vw,96px)] ${gridClass(imagenUrl !== null)}`}>
        {imagenUrl && (
          <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted sm:aspect-[5/4] lg:aspect-[4/5] lg:max-h-[88svh]">
            <Image
              src={imagenUrl}
              alt={tituloPlano(titulo)}
              fill
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className={`min-w-0 ${landingPadX} ${textoPadClass(imagenUrl !== null)}`}>
          <div className="max-w-[40rem]">
            {kicker && <Eyebrow>{kicker}</Eyebrow>}
            <h2 id={tituloId} className={`${landingH2} mb-6`}>
              <TituloResaltado texto={titulo} />
            </h2>
            {descripcion && (
              <p className="mb-6 max-w-[52ch] whitespace-pre-line text-[17px] leading-[1.7] text-muted-foreground">
                {descripcion}
              </p>
            )}
            {mostrarComoLlegar && (
              <a href="#donde-estamos" className={landingLinkArrow}>
                {t("landingHowToGetThere", language)}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
