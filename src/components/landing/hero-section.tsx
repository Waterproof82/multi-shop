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
  landingBtnGhost,
  landingBtnOscuro,
  landingShadowSoft,
  telHref,
} from "@/components/landing/landing-ui";

interface HeroSectionProps {
  contenido: Record<string, unknown>;
  empresaNombre: string;
  telefono: string | null;
}

function gridClass(conImagen: boolean): string {
  if (conImagen) return "lg:grid-cols-[1fr_1.1fr]";
  return "mx-auto max-w-4xl";
}

interface MetaProps {
  etiqueta: string;
  children: ReactNode;
}

// Par etiqueta/valor de una lista de descripcion (<dl>): "Horario" → "...".
function Meta({ etiqueta, children }: Readonly<MetaProps>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">{etiqueta}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
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
    <section
      aria-labelledby={tituloId}
      className={`grid w-full items-stretch gap-[clamp(16px,2.4vw,30px)] p-[clamp(16px,2.4vw,30px)] ${gridClass(imagenUrl !== null)}`}
    >
      {imagenUrl && (
        <div
          className={`relative h-[50vh] overflow-hidden rounded-[42px] lg:h-auto lg:min-h-[62vh] ${landingShadowSoft}`}
        >
          <Image
            src={imagenUrl}
            alt={empresaNombre}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-[center_55%] saturate-[1.05]"
            priority
          />
        </div>
      )}

      <div className="flex flex-col justify-center p-[clamp(24px,4vw,60px)]">
        {kicker && <Eyebrow>{kicker}</Eyebrow>}
        <h1 id={tituloId} className="mb-7 font-serif text-[clamp(40px,6.4vw,96px)] font-bold leading-[1.05] tracking-[-0.01em] text-foreground">
          <TituloResaltado texto={titulo} />
        </h1>
        {descripcion && (
          <p className="mb-9 max-w-[46ch] whitespace-pre-line text-[clamp(16px,1.4vw,19px)] leading-[1.55] text-muted-foreground">
            {descripcion}
          </p>
        )}
        <div className="mb-10 flex flex-wrap gap-3">
          <Link href="/carta" className={`${landingBtnOscuro} px-[30px] py-3 text-[15px]`}>
            <ShoppingBag className="size-5 shrink-0" aria-hidden="true" />
            {t("viewMenu", language)}
          </Link>
          {ctaSecundariaTexto && ctaSecundariaUrl && (
            <a href={ctaSecundariaUrl} target="_blank" rel="noopener noreferrer" className={landingBtnGhost}>
              {ctaSecundariaTexto}
              <AvisoNuevaPestana texto={nuevaPestana} />
            </a>
          )}
        </div>
        {(horario || telefono) && (
          <dl className="grid grid-cols-1 gap-6 border-t border-border pt-8 text-sm text-muted-foreground sm:grid-cols-2">
            {horario && <Meta etiqueta={t("landingHours", language)}>{horario}</Meta>}
            {telefono && (
              <Meta etiqueta={t("phone", language)}>
                <a href={telHref(telefono)} className="transition-colors hover:text-primary">
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
