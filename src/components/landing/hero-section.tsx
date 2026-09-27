"use client";

import { useId, type ReactNode } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import {
  AvisoNuevaPestana,
  Eyebrow,
  TituloResaltado,
  displayPhoneNumber,
  landingBtnOscuro,
  landingLinkArrow,
  landingPadX,
  telHref,
} from "@/components/landing/landing-ui";

interface HeroSectionProps {
  contenido: Record<string, unknown>;
  empresaNombre: string;
  telefono: string | null;
}

// Sin foto, el titular abre la pagina y necesita aire arriba; con foto, la
// foto ya hace de umbral y el texto se pega a su borde.
function bandaTextoClass(conImagen: boolean): string {
  if (conImagen) return "pt-[clamp(32px,5vw,72px)]";
  return "pt-[clamp(56px,10vw,140px)]";
}

interface MetaProps {
  etiqueta: string;
  children: ReactNode;
}

// Par etiqueta/valor de una lista de descripcion (<dl>): "Horario" → "...".
function Meta({ etiqueta, children }: Readonly<MetaProps>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{etiqueta}</dt>
      <dd className="whitespace-pre-line text-foreground">{children}</dd>
    </div>
  );
}

export function HeroSection({ contenido, empresaNombre, telefono }: Readonly<HeroSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? empresaNombre;
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;
  const horario = readTranslatable(contenido, "horario", language);
  const tituloId = useId();
  const nuevaPestana = t("opensInNewTab", language);

  return (
    <section aria-labelledby={tituloId} className="w-full">
      {/* La foto manda: a sangre, sin esquinas ni sombra. Su borde inferior es el separador. */}
      {imagenUrl && (
        <div className="relative h-[clamp(320px,72svh,820px)] w-full overflow-hidden bg-muted">
          <Image
            src={imagenUrl}
            alt={empresaNombre}
            fill
            sizes="100vw"
            className="object-cover object-[center_55%]"
            priority
          />
        </div>
      )}

      {/* Banda de texto asimetrica: titular a la izquierda, anotacion a la derecha. */}
      <div
        className={`mx-auto grid max-w-7xl grid-cols-1 gap-x-[clamp(32px,6vw,96px)] gap-y-8 pb-[clamp(48px,7vw,96px)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end ${landingPadX} ${bandaTextoClass(imagenUrl !== null)}`}
      >
        <div className="min-w-0">
          {kicker && <Eyebrow>{kicker}</Eyebrow>}
          <h1
            id={tituloId}
            className="font-serif text-[clamp(40px,6.2vw,104px)] font-normal leading-[1] tracking-[-0.025em] text-foreground [overflow-wrap:anywhere]"
          >
            <TituloResaltado texto={titulo} />
          </h1>
        </div>

        <div className="min-w-0 lg:pb-2">
          {descripcion && (
            <p className="mb-8 max-w-[44ch] whitespace-pre-line text-[clamp(16px,1.3vw,18px)] leading-[1.6] text-muted-foreground">
              {descripcion}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/carta" className={`${landingBtnOscuro} px-6 py-3 text-[15px]`}>
              <ShoppingBag className="size-[18px] shrink-0" aria-hidden="true" />
              {t("viewMenu", language)}
            </Link>
            {ctaSecundariaTexto && ctaSecundariaUrl && (
              <a href={ctaSecundariaUrl} target="_blank" rel="noopener noreferrer" className={landingLinkArrow}>
                {ctaSecundariaTexto}
                <AvisoNuevaPestana texto={nuevaPestana} />
              </a>
            )}
          </div>
        </div>

        {(horario || telefono) && (
          <dl className="grid grid-cols-1 gap-6 border-t border-foreground/15 pt-6 text-sm sm:grid-cols-2 lg:col-span-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            {horario && <Meta etiqueta={t("landingHours", language)}>{horario}</Meta>}
            {telefono && (
              <Meta etiqueta={t("phone", language)}>
                <a href={telHref(telefono)} className="underline-offset-4 transition-colors hover:text-primary hover:underline">
                  {displayPhoneNumber(telefono)}
                </a>
              </Meta>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}
