"use client";

import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { FacebookIcon } from "@/components/ui/facebook-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import {
  Eyebrow,
  TituloResaltado,
  landingBtnOscuro,
  landingBtnWhatsapp,
  landingH2,
  mapsSearchUrl,
} from "@/components/landing/landing-ui";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface VisitanosSectionProps {
  contenido: Record<string, unknown>;
  empresa: EmpresaPublic;
  whatsappHref: string | null;
}

interface InfoBlockProps {
  etiqueta: string;
  children: ReactNode;
}

function InfoBlock({ etiqueta, children }: Readonly<InfoBlockProps>) {
  return (
    <div>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">{etiqueta}</h3>
      <div className="whitespace-pre-line text-[15px] leading-[1.6] text-muted-foreground">{children}</div>
    </div>
  );
}

const socialPillClass =
  "inline-flex min-h-[44px] items-center gap-2.5 rounded-full border border-border bg-background px-4 text-xs font-semibold uppercase tracking-[0.08em] text-foreground transition-all duration-200 hover:-translate-y-px hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface RedesProps {
  empresa: EmpresaPublic;
  whatsappHref: string | null;
  etiqueta: string;
}

function Redes({ empresa, whatsappHref, etiqueta }: Readonly<RedesProps>) {
  if (!empresa.instagram && !empresa.fb && !whatsappHref) return null;
  return (
    <div className="mt-9 border-t border-border pt-7">
      <Eyebrow solo className="!mb-4">
        {etiqueta}
      </Eyebrow>
      <div className="flex flex-wrap gap-2">
        {empresa.instagram && (
          <a href={empresa.instagram} target="_blank" rel="noopener noreferrer" className={socialPillClass}>
            <InstagramIcon className="size-5 text-primary" />
            <span>Instagram</span>
          </a>
        )}
        {empresa.fb && (
          <a href={empresa.fb} target="_blank" rel="noopener noreferrer" className={socialPillClass}>
            <FacebookIcon className="size-5 text-primary" />
            <span>Facebook</span>
          </a>
        )}
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={socialPillClass}>
            <WhatsAppIcon className="size-5 text-primary" />
            <span>WhatsApp</span>
          </a>
        )}
      </div>
    </div>
  );
}

function gridClass(conMapa: boolean): string {
  if (conMapa) return "lg:grid-cols-[1.1fr_1fr]";
  return "max-w-3xl";
}

export function VisitanosSection({ contenido, empresa, whatsappHref }: Readonly<VisitanosSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingNavWhereWeAre", language);
  const horario = readTranslatable(contenido, "horario", language);
  const mapsHref = mapsSearchUrl(empresa.direccion, empresa.nombre);

  return (
    <section id="donde-estamos" className="w-full scroll-mt-20 px-[clamp(20px,4vw,64px)] py-[clamp(80px,10vw,140px)]">
      <div
        className={`mx-auto grid max-w-7xl items-stretch gap-[clamp(40px,6vw,80px)] ${gridClass(Boolean(empresa.urlMapa))}`}
      >
        {empresa.urlMapa && (
          <div className="relative min-h-[360px] overflow-hidden rounded-[26px] border border-border bg-muted shadow-[0_30px_60px_-20px_color-mix(in_oklch,var(--foreground)_35%,transparent)] lg:min-h-[540px]">
            <iframe
              title={t("locationIframe", language)}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              src={empresa.urlMapa}
            />
          </div>
        )}

        <div className="py-4">
          {kicker && <Eyebrow>{kicker}</Eyebrow>}
          <h2 className={landingH2}>
            <TituloResaltado texto={titulo} />
          </h2>

          <div className="mb-10 mt-8 grid grid-cols-1 gap-x-10 gap-y-8 border-t border-border pt-8 sm:grid-cols-2">
            {empresa.direccion && <InfoBlock etiqueta={t("address", language)}>{empresa.direccion}</InfoBlock>}
            {empresa.telefono && (
              <InfoBlock etiqueta={t("phone", language)}>
                <a
                  href={`tel:${empresa.telefono.replaceAll(/\s/g, "")}`}
                  className="transition-colors hover:text-primary"
                >
                  {empresa.telefono}
                </a>
              </InfoBlock>
            )}
            {horario && <InfoBlock etiqueta={t("landingHours", language)}>{horario}</InfoBlock>}
          </div>

          {(mapsHref || whatsappHref) && (
            <div className="flex flex-wrap gap-3">
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={`${landingBtnOscuro} px-[30px] py-3 text-[15px]`}>
                  <MapPin className="size-[18px] shrink-0" aria-hidden="true" />
                  {t("landingOpenInMaps", language)}
                </a>
              )}
              {whatsappHref && (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={landingBtnWhatsapp}>
                  <WhatsAppIcon className="size-[18px]" />
                  WhatsApp
                </a>
              )}
            </div>
          )}

          <Redes empresa={empresa} whatsappHref={whatsappHref} etiqueta={t("landingFollowUs", language)} />
        </div>
      </div>
    </section>
  );
}
