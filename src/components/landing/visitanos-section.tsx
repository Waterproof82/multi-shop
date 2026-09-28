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
  landingPadX,
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
      <dt className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{etiqueta}</dt>
      <dd className="whitespace-pre-line text-[15px] leading-[1.6] text-foreground">{children}</dd>
    </div>
  );
}

// Enlaces de texto con icono, no pastillas: son secundarios frente a Maps/WhatsApp.
const socialLinkClass =
  "inline-flex min-h-[44px] items-center gap-2 whitespace-nowrap text-sm font-semibold text-foreground underline decoration-foreground/30 decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-200 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface RedesProps {
  empresa: EmpresaPublic;
  etiqueta: string;
  nuevaPestana: string;
}

function Redes({ empresa, etiqueta, nuevaPestana }: Readonly<Omit<RedesProps, 'whatsappHref'>>) {
  if (!empresa.instagram && !empresa.fb) return null;
  return (
    <div className="mt-10 border-t border-foreground/15 pt-6">
      <Eyebrow className="!mb-2">{etiqueta}</Eyebrow>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 p-0">
        {empresa.instagram && (
          <li>
            <a href={empresa.instagram} target="_blank" rel="noopener noreferrer me" className={socialLinkClass}>
              <InstagramIcon className="size-[18px]" />
              <span>Instagram</span>
              <AvisoNuevaPestana texto={nuevaPestana} />
            </a>
          </li>
        )}
        {empresa.fb && (
          <li>
            <a href={empresa.fb} target="_blank" rel="noopener noreferrer me" className={socialLinkClass}>
              <FacebookIcon className="size-[18px]" />
              <span>Facebook</span>
              <AvisoNuevaPestana texto={nuevaPestana} />
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}

// Con mapa: el texto a la izquierda (con su padding) y el mapa pegado al borde
// derecho de la pantalla, como una foto mas. Sin mapa: solo la columna de texto.
function gridClass(conMapa: boolean): string {
  if (conMapa) return "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]";
  return "mx-auto max-w-7xl";
}

// Junto al mapa, el hueco del grid ya separa y el texto se arrima a el.
function textoPadClass(conMapa: boolean): string {
  if (conMapa) return "lg:pr-0";
  return "";
}

function textoAlineadoClass(conMapa: boolean): string {
  if (conMapa) return "lg:ml-auto";
  return "";
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
    <section id="donde-estamos" aria-labelledby={tituloId} className="w-full scroll-mt-20 py-[clamp(64px,10vw,140px)]">
      <div className={`grid grid-cols-1 items-stretch gap-[clamp(40px,6vw,96px)] ${gridClass(Boolean(empresa.urlMapa))}`}>
        <div className={`min-w-0 ${landingPadX} ${textoPadClass(Boolean(empresa.urlMapa))}`}>
          <div className={`max-w-[36rem] ${textoAlineadoClass(Boolean(empresa.urlMapa))}`}>
            {kicker && <Eyebrow>{kicker}</Eyebrow>}
            <h2 id={tituloId} className={landingH2}>
              <TituloResaltado texto={titulo} />
            </h2>

            <dl className="mb-10 mt-8 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-foreground/15 pt-6 sm:grid-cols-2">
              {empresa.direccion && <InfoBlock etiqueta={t("address", language)}>{empresa.direccion}</InfoBlock>}
              {empresa.telefono && (
                <InfoBlock etiqueta={t("phone", language)}>
                  <a
                    href={telHref(empresa.telefono)}
                    className="underline-offset-4 transition-colors hover:text-primary hover:underline"
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
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={`${landingBtnOscuro} px-6 py-3 text-[15px]`}>
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
              etiqueta={t("landingFollowUs", language)}
              nuevaPestana={nuevaPestana}
            />
          </div>
        </div>

        {empresa.urlMapa && (
          <div className="relative min-h-[360px] overflow-hidden bg-muted lg:min-h-[560px]">
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
      </div>
    </section>
  );
}
