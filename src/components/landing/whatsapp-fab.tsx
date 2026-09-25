"use client";

import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

interface WhatsappFabProps {
  href: string;
}

// Boton flotante de WhatsApp abajo a la derecha (".wa-float" de la referencia).
export function WhatsappFab({ href }: Readonly<WhatsappFabProps>) {
  const { language } = useLanguage();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${t("landingWhatsappStripTitle", language)} ${t("opensInNewTab", language)}`}
      className="fixed bottom-[18px] right-[18px] z-40 inline-flex size-[52px] items-center justify-center rounded-full bg-whatsapp text-white shadow-[0_10px_26px_-6px_color-mix(in_oklch,var(--foreground)_40%,transparent)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:size-14"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
