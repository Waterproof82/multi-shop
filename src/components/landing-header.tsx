"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { landingBtnOscuro } from "@/components/landing/landing-ui";
import { LanguageSelector } from "@/components/language-selector";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface LandingHeaderProps {
  empresa: EmpresaPublic;
  showNosotros: boolean;
  showDondeEstamos: boolean;
}

// Ya en la home, el logo no navega (seria un no-op): sube al inicio. Sin
// animacion si el usuario pidio reducir movimiento.
function subirAlInicio(e: React.MouseEvent<HTMLAnchorElement>, pathname: string | null) {
  if (pathname !== "/") return;
  e.preventDefault();
  const reducir = globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
  globalThis.scrollTo({ top: 0, behavior: reducir ? "auto" : "smooth" });
}

export function LandingHeader({ empresa, showNosotros, showDondeEstamos }: Readonly<LandingHeaderProps>) {
  const { language } = useLanguage();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-[clamp(16px,4vw,64px)] md:h-20">
        {/* Nombre accesible = texto o `alt` del logo; con aria-label ademas se
            duplicaba. `/` (no "#"): enlace real a la home, rastreable. */}
        <Link href="/" onClick={(e) => subirAlInicio(e, pathname)} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          {!empresa.logoUrl && (
            <span className="line-clamp-2 font-serif text-lg font-normal leading-tight tracking-[-0.02em] text-foreground md:text-2xl">
              {empresa.nombre}
            </span>
          )}
          {empresa.logoUrl && (
            // Logos de rotulo muy apaisados (p. ej. 260x40): el alto de la
            // cabecera manda y el ancho cede solo si no cabe (flex-1 del Link).
            <div className="relative h-8 w-full max-w-[260px] md:h-10">
              <Image
                src={empresa.logoUrl}
                alt={empresa.nombre || t("companyLogo", language)}
                fill
                sizes="(max-width: 768px) 60vw, 260px"
                className="object-contain object-left"
                loading="eager"
              />
            </div>
          )}
        </Link>
        <nav aria-label={t("landingMainNavLabel", language)} className="flex items-center gap-1 md:gap-4">
          {showNosotros && (
            <a
              href="#nosotros"
              className="hidden min-h-[44px] items-center whitespace-nowrap px-2 text-sm font-semibold text-foreground/75 underline-offset-[6px] transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex md:px-3"
            >
              {t("landingNavAboutUs", language)}
            </a>
          )}
          {showDondeEstamos && (
            <a
              href="#donde-estamos"
              className="hidden min-h-[44px] items-center whitespace-nowrap px-2 text-sm font-semibold text-foreground/75 underline-offset-[6px] transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex md:px-3"
            >
              {t("landingNavWhereWeAre", language)}
            </a>
          )}
          <Link
            href="/carta"
            className={`${landingBtnOscuro} whitespace-nowrap px-4 text-sm md:px-5`}
          >
            <ShoppingBag className="size-4 shrink-0" aria-hidden="true" />
            {t("viewMenu", language)}
          </Link>
          <LanguageSelector />
        </nav>
      </div>
    </header>
  );
}
