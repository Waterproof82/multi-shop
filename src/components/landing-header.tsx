"use client";

import Link from "next/link";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { LanguageSelector } from "@/components/language-selector";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface LandingHeaderProps {
  empresa: EmpresaPublic;
  showNosotros: boolean;
  showDondeEstamos: boolean;
}

export function LandingHeader({ empresa, showNosotros, showDondeEstamos }: Readonly<LandingHeaderProps>) {
  const { language } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:h-20 md:px-6">
        <a href="#" className="flex min-h-[44px] min-w-0 items-center gap-2" aria-label={empresa.nombre}>
          {!empresa.logoUrl && (
            <span className="line-clamp-2 font-serif text-lg font-bold leading-tight tracking-[-0.01em] text-foreground md:text-2xl">
              {empresa.nombre}
            </span>
          )}
          {empresa.logoUrl && (
            <div className="relative h-12 w-24 md:h-16 md:w-32">
              <Image
                src={empresa.logoUrl}
                alt={empresa.nombre ?? t("companyLogo", language)}
                fill
                sizes="(max-width: 768px) 96px, 128px"
                className="object-contain"
                loading="eager"
              />
            </div>
          )}
        </a>
        <nav className="flex items-center gap-1 md:gap-4">
          {showNosotros && (
            <a
              href="#nosotros"
              className="hidden min-h-[44px] items-center px-2 text-[15px] font-bold text-foreground/80 transition-colors hover:text-primary sm:inline-flex md:px-3"
            >
              {t("landingNavAboutUs", language)}
            </a>
          )}
          {showDondeEstamos && (
            <a
              href="#donde-estamos"
              className="hidden min-h-[44px] items-center px-2 text-[15px] font-bold text-foreground/80 transition-colors hover:text-primary sm:inline-flex md:px-3"
            >
              {t("landingNavWhereWeAre", language)}
            </a>
          )}
          <Link
            href="/carta"
            className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full bg-primary px-4 text-sm font-extrabold md:px-5 text-primary-foreground transition-all hover:-translate-y-px hover:opacity-90"
          >
            {t("viewMenu", language)}
          </Link>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
}
