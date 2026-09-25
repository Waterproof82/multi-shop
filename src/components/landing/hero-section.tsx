"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import {
  Eyebrow,
  TituloResaltado,
  landingBtnGhost,
  landingBtnPrimary,
  landingShadowSoft,
} from "@/components/landing/landing-ui";

interface HeroSectionProps {
  contenido: Record<string, unknown>;
  empresaNombre: string;
  telefono: string | null;
  whatsappHref: string | null;
}

function gridClass(conImagen: boolean): string {
  if (conImagen) return "lg:grid-cols-[1fr_1.1fr]";
  return "mx-auto max-w-4xl";
}

interface MetaProps {
  etiqueta: string;
  children: ReactNode;
}

function Meta({ etiqueta, children }: Readonly<MetaProps>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">{etiqueta}</span>
      <em className="not-italic">{children}</em>
    </div>
  );
}

export function HeroSection({ contenido, empresaNombre, telefono, whatsappHref }: Readonly<HeroSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? empresaNombre;
  const descripcion = readTranslatable(contenido, "descripcion", language);
  const imagenUrl = typeof contenido.imagenUrl === "string" && contenido.imagenUrl ? contenido.imagenUrl : null;
  const ctaSecundariaTexto = readTranslatable(contenido, "ctaSecundariaTexto", language);
  const ctaSecundariaUrl =
    typeof contenido.ctaSecundariaUrl === "string" && contenido.ctaSecundariaUrl ? contenido.ctaSecundariaUrl : null;
  const horario = readTranslatable(contenido, "horario", language);

  return (
    <section
      className={`grid w-full items-stretch gap-[clamp(16px,2.4vw,30px)] p-[clamp(16px,2.4vw,30px)] ${gridClass(imagenUrl !== null)}`}
    >
      {imagenUrl && (
        <div
          className={`relative h-[50vh] overflow-hidden rounded-[42px] lg:h-auto lg:min-h-[62vh] ${landingShadowSoft}`}
        >
          <Image
            src={imagenUrl}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-[center_55%] saturate-[1.05]"
            priority
          />
        </div>
      )}

      <div className="flex flex-col justify-center p-[clamp(24px,4vw,60px)]">
        {kicker && <Eyebrow>{kicker}</Eyebrow>}
        <h1 className="mb-7 font-serif text-[clamp(40px,6.4vw,96px)] font-bold leading-[1.05] tracking-[-0.01em] text-foreground">
          <TituloResaltado texto={titulo} />
        </h1>
        {descripcion && (
          <p className="mb-9 max-w-[46ch] whitespace-pre-line text-[clamp(16px,1.4vw,19px)] leading-[1.55] text-muted-foreground">
            {descripcion}
          </p>
        )}
        <div className="mb-6 flex flex-wrap gap-3">
          <Link href="/carta" className={landingBtnPrimary}>
            {t("viewMenu", language)}
          </Link>
          {ctaSecundariaTexto && ctaSecundariaUrl && (
            <a href={ctaSecundariaUrl} target="_blank" rel="noopener noreferrer" className={landingBtnGhost}>
              {ctaSecundariaTexto}
            </a>
          )}
        </div>
        {whatsappHref && (
          <p className="mb-10 text-sm">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-2 border-b border-transparent font-semibold text-whatsapp-ink transition-colors hover:border-whatsapp-ink"
            >
              <WhatsAppIcon className="size-[18px] shrink-0" />
              <span>{t("landingHeroWhatsappHint", language)}</span>
            </a>
          </p>
        )}
        {(horario || telefono) && (
          <div className="grid grid-cols-1 gap-6 border-t border-border pt-8 text-sm text-muted-foreground sm:grid-cols-2">
            {horario && <Meta etiqueta={t("landingHours", language)}>{horario}</Meta>}
            {telefono && <Meta etiqueta={t("phone", language)}>{telefono}</Meta>}
          </div>
        )}
      </div>
    </section>
  );
}
