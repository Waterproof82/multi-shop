"use client";

import { LandingHeader } from "@/components/landing-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroSection } from "@/components/landing/hero-section";
import { NosotrosSection } from "@/components/landing/nosotros-section";
import { CtaCartaSection } from "@/components/landing/cta-carta-section";
import { TestimonioSection } from "@/components/landing/testimonio-section";
import { GaleriaSection } from "@/components/landing/galeria-section";
import { VisitanosSection } from "@/components/landing/visitanos-section";
import { WhatsappStrip } from "@/components/landing/whatsapp-strip";
import { WhatsappFab } from "@/components/landing/whatsapp-fab";
import { Marquee } from "@/components/landing/marquee";
import { whatsappUrl } from "@/components/landing/landing-ui";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import type { EmpresaPublic, LandingSeccion } from "@/core/domain/entities/types";

interface LandingPageProps {
  empresa: EmpresaPublic;
  sections: LandingSeccion[];
}

interface RenderContext {
  empresa: EmpresaPublic;
  whatsappHref: string | null;
  showDondeEstamos: boolean;
}

function renderSeccion(seccion: LandingSeccion, ctx: RenderContext) {
  switch (seccion.tipo) {
    case "nosotros":
      return (
        <NosotrosSection key={seccion.id} contenido={seccion.contenido} mostrarComoLlegar={ctx.showDondeEstamos} />
      );
    case "cta_carta":
      return <CtaCartaSection key={seccion.id} contenido={seccion.contenido} />;
    case "testimonio":
      return <TestimonioSection key={seccion.id} contenido={seccion.contenido} />;
    case "galeria":
      return <GaleriaSection key={seccion.id} contenido={seccion.contenido} empresaNombre={ctx.empresa.nombre} />;
    case "visitanos":
      return (
        <VisitanosSection
          key={seccion.id}
          contenido={seccion.contenido}
          empresa={ctx.empresa}
          whatsappHref={ctx.whatsappHref}
        />
      );
    default:
      return null;
  }
}

function palabrasMarquee(texto: string | null): string[] {
  if (!texto) return [];
  return texto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// Brillos radiales muy suaves sobre el fondo (".body" de la referencia),
// derivados de los colores del tenant.
const FONDO_BRILLOS = {
  backgroundImage: [
    "radial-gradient(at 14% 8%, color-mix(in oklch, var(--primary) 12%, transparent) 0%, transparent 45%)",
    "radial-gradient(at 86% 10%, color-mix(in oklch, var(--accent) 30%, transparent) 0%, transparent 42%)",
    "radial-gradient(at 80% 86%, color-mix(in oklch, var(--primary) 7%, transparent) 0%, transparent 46%)",
    "radial-gradient(at 22% 92%, color-mix(in oklch, var(--accent) 25%, transparent) 0%, transparent 46%)",
  ].join(", "),
};

export function LandingPage({ empresa, sections }: Readonly<LandingPageProps>) {
  const { language } = useLanguage();
  const heroContenido = sections.find((s) => s.tipo === "hero")?.contenido ?? {};
  const showNosotros = sections.some((s) => s.tipo === "nosotros");
  const showDondeEstamos = sections.some((s) => s.tipo === "visitanos");
  const restoDeSecciones = sections.filter((s) => s.tipo !== "hero");
  const whatsappHref = whatsappUrl(empresa.telefono);
  const marquee = palabrasMarquee(readTranslatable(heroContenido, "marquee", language));

  return (
    <div className="relative isolate flex min-h-screen flex-col bg-background">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10" style={FONDO_BRILLOS} />

      <LandingHeader empresa={empresa} showNosotros={showNosotros} showDondeEstamos={showDondeEstamos} />

      <main id="main-content" className="flex-1">
        <HeroSection
          contenido={heroContenido}
          empresaNombre={empresa.nombre}
          telefono={empresa.telefono}
          whatsappHref={whatsappHref}
        />
        {whatsappHref && <WhatsappStrip href={whatsappHref} />}
        <Marquee palabras={marquee} />

        {restoDeSecciones.map((seccion) => renderSeccion(seccion, { empresa, whatsappHref, showDondeEstamos }))}
      </main>

      {/* Mismo pie que la carta; su mapa se omite si Visítanos ya pinta uno. */}
      <SiteFooter empresa={empresa} hideMap={showDondeEstamos} />
      {whatsappHref && <WhatsappFab href={whatsappHref} />}
    </div>
  );
}
