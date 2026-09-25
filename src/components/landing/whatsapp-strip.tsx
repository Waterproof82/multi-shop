"use client";

import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { AvisoNuevaPestana, landingPadX } from "@/components/landing/landing-ui";

interface WhatsappStripProps {
  href: string;
}

// Franja verde bajo el hero (".order-strip" de la referencia).
export function WhatsappStrip({ href }: Readonly<WhatsappStripProps>) {
  const { language } = useLanguage();
  const titulo = t("landingWhatsappStripTitle", language);

  return (
    <aside aria-label={titulo} className="border-y border-white/15 bg-gradient-to-r from-whatsapp-strip to-whatsapp-strip-2 text-white">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`group mx-auto grid max-w-7xl grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-3 py-4 sm:grid-cols-[auto_1fr_auto] sm:gap-5 sm:py-[18px] ${landingPadX} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white`}
      >
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-full bg-white/15">
          <WhatsAppIcon className="size-7" />
        </span>
        <span>
          <span className="block font-serif text-[clamp(18px,2.2vw,24px)] font-normal italic leading-tight">
            {titulo}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug opacity-90">
            {t("landingWhatsappStripSub", language)}
          </span>
          <AvisoNuevaPestana texto={t("opensInNewTab", language)} />
        </span>
        <span
          aria-hidden="true"
          className="col-span-2 whitespace-nowrap rounded-full border border-white/45 px-3.5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors group-hover:border-white/85 group-hover:bg-white/15 sm:col-span-1"
        >
          {t("landingWhatsappStripCta", language)}
        </span>
      </a>
    </aside>
  );
}
