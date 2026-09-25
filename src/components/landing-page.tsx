"use client";

import { LandingHeader } from "@/components/landing-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSection } from "@/components/landing/hero-section";
import { NosotrosSection } from "@/components/landing/nosotros-section";
import { CtaCartaSection } from "@/components/landing/cta-carta-section";
import { TestimonioSection } from "@/components/landing/testimonio-section";
import { GaleriaSection } from "@/components/landing/galeria-section";
import { VisitanosSection } from "@/components/landing/visitanos-section";
import type { EmpresaPublic, LandingSeccion } from "@/core/domain/entities/types";

interface LandingPageProps {
  empresa: EmpresaPublic;
  sections: LandingSeccion[];
}

function renderSeccion(seccion: LandingSeccion, empresa: EmpresaPublic) {
  switch (seccion.tipo) {
    case "nosotros":
      return <NosotrosSection key={seccion.id} contenido={seccion.contenido} />;
    case "cta_carta":
      return <CtaCartaSection key={seccion.id} contenido={seccion.contenido} />;
    case "testimonio":
      return <TestimonioSection key={seccion.id} contenido={seccion.contenido} />;
    case "galeria":
      return <GaleriaSection key={seccion.id} contenido={seccion.contenido} />;
    case "visitanos":
      return <VisitanosSection key={seccion.id} contenido={seccion.contenido} empresa={empresa} />;
    default:
      return null;
  }
}

export function LandingPage({ empresa, sections }: Readonly<LandingPageProps>) {
  const heroContenido = sections.find((s) => s.tipo === "hero")?.contenido ?? {};
  const showNosotros = sections.some((s) => s.tipo === "nosotros");
  const showDondeEstamos = sections.some((s) => s.tipo === "visitanos");
  const restoDeSecciones = sections.filter((s) => s.tipo !== "hero");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <LandingHeader empresa={empresa} showNosotros={showNosotros} showDondeEstamos={showDondeEstamos} />

      <HeroSection contenido={heroContenido} empresaNombre={empresa.nombre} />

      {restoDeSecciones.map((seccion) => renderSeccion(seccion, empresa))}

      <SiteFooter empresa={empresa} hideMap={showDondeEstamos} />
    </div>
  );
}
