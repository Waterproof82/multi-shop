"use client";

import { useId, type ReactNode } from "react";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { FacebookIcon } from "@/components/ui/facebook-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import {
  AvisoNuevaPestana,
  Eyebrow,
  TituloResaltado,
  displayPhoneNumber,
  landingBtnOscuro,
  landingBtnWhatsapp,
  landingH2,
  mapsSearchUrl,
  telHref,
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

// Par etiqueta/valor dentro de un <dl>: "Dirección" → "C/ ...". Son datos,
// no apartados del documento, asi que no van como <h3>.
function InfoBlock({ etiqueta, children }: Readonly<InfoBlockProps>) {
  return (
    <div>
      <dt className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">{etiqueta}</dt>
      <dd className="whitespace-pre-line text-[15px] leading-[1.6] text-muted-foreground">{children}</dd>
    </div>
  );
}

const socialPillClass =
  "inline-flex min-h-[44px] items-center gap-2.5 rounded-full border border-border bg-background px-4 text-xs font-semibold uppercase tracking-[0.08em] text-foreground transition-all duration-200 hover:-translate-y-px hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface RedesProps {
  empresa: EmpresaPublic;
  whatsappHref: string | null;
  etiqueta: string;
  nuevaPestana: string;
}

function Redes({ empresa, whatsappHref, etiqueta, nuevaPestana }: Readonly<RedesProps>) {
  if (!empresa.instagram && !empresa.fb && !whatsappHref) return null;
  return (
    <div className="mt-9 border-t border-border pt-7">
      <Eyebrow solo className="!mb-4">
        {etiqueta}
      </Eyebrow>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {empresa.instagram && (
          <li>
            <a href={empresa.instagram} target="_blank" rel="noopener noreferrer me" className={socialPillClass}>
              <InstagramIcon className="size-5 text-primary" />
              <span>Instagram</span>
              <AvisoNuevaPestana texto={nuevaPestana} />
            </a>
          </li>
        )}
        {empresa.fb && (
          <li>
            <a href={empresa.fb} target="_blank" rel="noopener noreferrer me" className={socialPillClass}>
              <FacebookIcon className="size-5 text-primary" />
              <span>Facebook</span>
              <AvisoNuevaPestana texto={nuevaPestana} />
            </a>
          </li>
        )}
        {whatsappHref && (
          <li>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={socialPillClass}>
              <WhatsAppIcon className="size-5 text-primary" />
              <span>WhatsApp</span>
              <AvisoNuevaPestana texto={nuevaPestana} />
            </a>
          </li>
        )}
      </ul>
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
  const tituloId = useId();
  const nuevaPestana = t("opensInNewTab", language);

  return (
    <section id="donde-estamos" aria-labelledby={tituloId} className="w-full scroll-mt-20 px-[clamp(20px,4vw,64px)] py-[clamp(80px,10vw,140px)]">
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
          <h2 id={tituloId} className={landingH2}>
            <TituloResaltado texto={titulo} />
          </h2>

          <dl className="mb-10 mt-8 grid grid-cols-1 gap-x-10 gap-y-8 border-t border-border pt-8 sm:grid-cols-2">
            {empresa.direccion && <InfoBlock etiqueta={t("address", language)}>{empresa.direccion}</InfoBlock>}
            {empresa.telefono && (
              <InfoBlock etiqueta={t("phone", language)}>
                <a
                  href={telHref(empresa.telefono)}
                  className="transition-colors hover:text-primary"
                >
                  {displayPhoneNumber(empresa.telefono)}
                </a>
              </InfoBlock>
            )}
            {horario && <InfoBlock etiqueta={t("landingHours", language)}>{horario}</InfoBlock>}
          </dl>

          {(mapsHref || whatsappHref) && (
            <div className="flex flex-wrap gap-3">
              {mapsHref && (
                <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={`${landingBtnOscuro} px-[30px] py-3 text-[15px]`}>
                  <MapPin className="size-[18px] shrink-0" aria-hidden="true" />
                  {t("landingOpenInMaps", language)}
                  <AvisoNuevaPestana texto={nuevaPestana} />
                </a>
              )}
              {whatsappHref && (
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className={landingBtnWhatsapp}>
                  <WhatsAppIcon className="size-[18px]" />
                  WhatsApp
                  <AvisoNuevaPestana texto={nuevaPestana} />
                </a>
              )}
            </div>
          )}

          <Redes
            empresa={empresa}
            whatsappHref={whatsappHref}
            etiqueta={t("landingFollowUs", language)}
            nuevaPestana={nuevaPestana}
          />
        </div>
      </div>
    </section>
  );
}
