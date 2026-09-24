"use client";

import Link from "next/link";
import { LandingHeader } from "@/components/landing-header";
import { SiteFooter } from "@/components/site-footer";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { hasNosotrosContent, hasDondeEstamosContent } from "@/lib/landing/landing-content";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface LandingPageProps {
  empresa: EmpresaPublic;
}

export function LandingPage({ empresa }: Readonly<LandingPageProps>) {
  const { language } = useLanguage();
  const showNosotros = hasNosotrosContent(empresa.descripcion);
  const showDondeEstamos = hasDondeEstamosContent(empresa);
  const descripcion = empresa.descripcion?.[language] ?? empresa.descripcion?.es ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader empresa={empresa} showNosotros={showNosotros} showDondeEstamos={showDondeEstamos} />

      <section className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        {empresa.titulo && (
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {empresa.titulo}
          </p>
        )}
        <h1 className="text-4xl font-bold text-foreground md:text-6xl">{empresa.nombre}</h1>
        {empresa.subtitulo && <p className="text-lg text-muted-foreground">{empresa.subtitulo}</p>}
        <Link
          href="/carta"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("viewMenu", language)}
        </Link>
      </section>

      {showNosotros && (
        <section id="nosotros" className="mx-auto w-full max-w-3xl px-4 py-16">
          <h2 className="mb-4 text-2xl font-bold text-foreground">{t("landingNavAboutUs", language)}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">{descripcion}</p>
        </section>
      )}

      {showDondeEstamos && (
        <section id="donde-estamos" className="mx-auto w-full max-w-3xl px-4 py-16">
          <h2 className="mb-4 text-2xl font-bold text-foreground">{t("landingNavWhereWeAre", language)}</h2>
          <div className="space-y-2 text-base text-muted-foreground">
            {empresa.direccion && <p>{empresa.direccion}</p>}
            {empresa.telefono && <p>{empresa.telefono}</p>}
          </div>
          {empresa.urlMapa && (
            <div className="mt-6 h-80 w-full overflow-hidden rounded-lg border border-border">
              <iframe
                title={t("locationIframe", language)}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={empresa.urlMapa}
              />
            </div>
          )}
        </section>
      )}

      <SiteFooter empresa={empresa} />
    </div>
  );
}
