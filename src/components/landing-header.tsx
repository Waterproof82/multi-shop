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
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <div className="flex items-center gap-2">
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
        </div>
        <nav className="flex items-center gap-1 md:gap-4">
          {showNosotros && (
            <a
              href="#nosotros"
              className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80 hover:text-foreground md:px-3"
            >
              {t("landingNavAboutUs", language)}
            </a>
          )}
          {showDondeEstamos && (
            <a
              href="#donde-estamos"
              className="inline-flex min-h-[44px] items-center px-2 text-sm font-medium text-foreground/80 hover:text-foreground md:px-3"
            >
              {t("landingNavWhereWeAre", language)}
            </a>
          )}
          <Link
            href="/carta"
            className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("viewMenu", language)}
          </Link>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
}
