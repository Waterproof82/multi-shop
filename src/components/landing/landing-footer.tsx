"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { FacebookIcon } from "@/components/ui/facebook-icon";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { useLanguage, type Language } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { landingPadX } from "@/components/landing/landing-ui";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface LandingFooterProps {
  empresa: EmpresaPublic;
  whatsappHref: string | null;
  showNosotros: boolean;
  showDondeEstamos: boolean;
}

function textoTraducido(valor: EmpresaPublic["footer1"], language: Language): string | null {
  if (!valor) return null;
  return valor[language] ?? valor.es ?? null;
}

const socialClass =
  "inline-grid size-11 place-items-center rounded-full border border-footer-fg/25 bg-footer-fg/10 text-footer-fg transition-all duration-200 hover:-translate-y-0.5 hover:bg-footer-fg hover:text-footer-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-footer-fg/60";

const navClass =
  "inline-flex min-h-[44px] items-center text-[15px] font-bold text-footer-fg/85 transition-colors hover:text-footer-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-footer-fg/60";

// Footer propio de la landing (".foot" de la referencia): panel oscuro con
// esquinas superiores redondeadas, marca + redes, navegación y legal.
export function LandingFooter({ empresa, whatsappHref, showNosotros, showDondeEstamos }: Readonly<LandingFooterProps>) {
  const { language } = useLanguage();
  const lema = textoTraducido(empresa.footer1, language) ?? textoTraducido(empresa.descripcion, language);
  const anio = new Date().getFullYear();

  return (
    <footer
      className={`relative mt-[clamp(40px,6vw,80px)] rounded-t-[42px] bg-footer-bg pb-9 pt-20 text-footer-fg ${landingPadX}`}
    >
      <span aria-hidden="true" className="absolute left-1/2 top-0 h-px w-20 -translate-x-1/2 bg-footer-fg/50" />

      <div className="mx-auto grid max-w-7xl items-start gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="font-serif text-3xl font-bold tracking-[-0.01em]">{empresa.nombre}</p>
          {lema && <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-footer-fg/70">{lema}</p>}
          <div className="mt-[18px] flex gap-3.5">
            {empresa.instagram && (
              <a href={empresa.instagram} target="_blank" rel="noopener noreferrer" aria-label={t("instagram", language)} className={socialClass}>
                <InstagramIcon className="size-5" />
              </a>
            )}
            {empresa.fb && (
              <a href={empresa.fb} target="_blank" rel="noopener noreferrer" aria-label={t("facebook", language)} className={socialClass}>
                <FacebookIcon className="size-5" />
              </a>
            )}
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className={socialClass}>
                <WhatsAppIcon className="size-5" />
              </a>
            )}
          </div>
        </div>

        <nav className="flex flex-col" aria-label={empresa.nombre}>
          <Link href="/carta" className={navClass}>
            {t("viewMenu", language)}
          </Link>
          {showNosotros && (
            <a href="#nosotros" className={navClass}>
              {t("landingNavAboutUs", language)}
            </a>
          )}
          {showDondeEstamos && (
            <a href="#donde-estamos" className={navClass}>
              {t("landingNavWhereWeAre", language)}
            </a>
          )}
        </nav>

        <div className="space-y-2 text-sm text-footer-fg/70 md:text-right">
          {empresa.direccion && <p>{empresa.direccion}</p>}
          {empresa.emailNotification && (
            <p>
              <a href={`mailto:${empresa.emailNotification}`} className="hover:text-footer-fg">
                {empresa.emailNotification}
              </a>
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-footer-fg/15 pt-6 text-xs text-footer-fg/60 md:flex-row">
        <p>
          © {anio} {empresa.nombre} · {t("landingAllRightsReserved", language)}
        </p>
        <a
          href="/admin/login"
          rel="nofollow"
          aria-label={t("admin", language)}
          className="inline-grid size-11 place-items-center rounded-sm text-footer-fg/60 hover:text-footer-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-footer-fg/60"
        >
          <Settings className="size-4" />
        </a>
      </div>
    </footer>
  );
}
