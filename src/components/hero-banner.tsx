"use client"

import { ImagenSubida as Image } from './ui/imagen-subida';
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { pickTranslatable } from "@/lib/landing/read-translatable"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface HeroBannerProps {
  readonly empresa?: EmpresaPublic | null;
  readonly bannerFit?: "contain" | "cover" | "fill";
}

function getBannerHeight(): string {
  // Fixed height: 200px mobile, 280px desktop - same proportion always
  return "h-[200px] md:h-[280px]";
}

export function HeroBanner({ empresa, bannerFit }: HeroBannerProps) {
  const { language } = useLanguage()

  const logoUrl = empresa?.mostrarLogo !== false ? (empresa?.logoUrl ?? null) : null
  const urlImage = empresa?.urlImage ?? null

  const titulo = empresa?.titulo ?? null
  const subtitulo = empresa?.subtitulo ?? null
  const subtitulo2 = empresa?.subtitulo2?.[language] ?? empresa?.subtitulo2?.es ?? null
  const descripcion = pickTranslatable(empresa?.descripcion, language)

  const showTitulo = titulo !== null && titulo !== ""
  const showSubtitulo = subtitulo !== null && subtitulo !== ""

  const heightClass = getBannerHeight();

  // Get background size based on user selection
  const getBackgroundSize = (fit?: string): string => {
    if (fit === "contain") return "contain";
    if (fit === "cover") return "cover";
    return "100% 100%"; // fill - stretch to fit
  };

  const bgSize = getBackgroundSize(bannerFit ?? "fill");

  return (
    <div
      className={`relative flex flex-col items-center justify-center overflow-hidden bg-primary text-center ${heightClass}`}
      style={urlImage ? { backgroundImage: `url(${urlImage})`, backgroundSize: bgSize, backgroundPosition: 'center', backgroundRepeat: bannerFit === "contain" ? 'no-repeat' : 'no-repeat' } : undefined}
    >

      {/* Sin entrada animada: el banner es la primera pintura de la carta y
          no debe llegar "deslizandose". */}
      {logoUrl && (
        <div className="relative z-10">
          <Image
            src={logoUrl}
            alt={empresa?.nombre ?? t("companyLogo", language)}
            width={200}
            height={100}
            className="mx-auto mb-6 h-24 w-auto md:h-32"
          />
        </div>
      )}

      <div className="relative z-10 px-4">
        {showTitulo && (
          <h1 className="font-serif text-3xl font-normal tracking-[-0.02em] text-primary-foreground [overflow-wrap:anywhere] sm:text-4xl md:text-5xl lg:text-6xl">
            {titulo}
          </h1>
        )}
        {/* Sin titulo configurado la carta se quedaba sin ningun <h1> (SEO). Oculto: no cambia el diseno. */}
        {!showTitulo && empresa?.nombre && <h1 className="sr-only">{empresa.nombre}</h1>}
        {showSubtitulo && (
          <p className="mt-2 font-serif text-xl text-primary-foreground/80 md:text-2xl">
            {subtitulo}
          </p>
        )}
        {descripcion && (
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-primary-foreground/90 md:text-base">
            {descripcion}
          </p>
        )}
      </div>

      {subtitulo2 && (
        <div className="relative z-10 mt-6 flex items-center gap-3">
          <div className="h-px w-12 bg-primary-foreground/40" />
          <p className="text-sm uppercase tracking-widest text-primary-foreground/60">
            {subtitulo2}
          </p>
          <div className="h-px w-12 bg-primary-foreground/40" />
        </div>
      )}
    </div>
  )
}
