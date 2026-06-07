"use client"

import { motion, useReducedMotion } from "framer-motion"
import Image from "next/image"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
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
  const shouldReduceMotion = useReducedMotion() ?? false
  
  const logoUrl = empresa?.mostrarLogo !== false ? (empresa?.logoUrl ?? null) : null
  const urlImage = empresa?.urlImage ?? null
  
  const titulo = empresa?.titulo ?? null
  const subtitulo = empresa?.subtitulo ?? null
  const subtitulo2 = empresa?.subtitulo2?.[language] ?? empresa?.subtitulo2?.es ?? null
  const descripcion = empresa?.descripcion?.[language] ?? empresa?.descripcion?.es ?? null

  const showTitulo = titulo !== null && titulo !== ""
  const showSubtitulo = subtitulo !== null && subtitulo !== ""

  const titleVariants = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

  const descVariants = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { opacity: 0 }, animate: { opacity: 1 } };

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

      <motion.div
        variants={titleVariants}
        transition={{ duration: shouldReduceMotion ? 0 : 0.6 }}
        className="relative z-10"
      >
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={empresa?.nombre ?? t("companyLogo", language)}
            width={200}
            height={100}
            className="mx-auto mb-6 h-24 w-auto md:h-32"
          />
        )}
      </motion.div>

      <motion.div
        variants={titleVariants}
        transition={{ duration: shouldReduceMotion ? 0 : 0.6, delay: shouldReduceMotion ? 0 : 0.2 }}
        className="relative z-10"
      >
        {showTitulo && (
          <h1 className="font-serif text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            {titulo}
          </h1>
        )}
        {showSubtitulo && (
          <p className="mt-2 font-serif text-xl italic text-primary-foreground/80 md:text-2xl">
            {subtitulo}
          </p>
        )}
        {descripcion && (
          <motion.p 
            variants={descVariants}
            transition={{ duration: shouldReduceMotion ? 0 : 0.6, delay: shouldReduceMotion ? 0 : 0.4 }}
            className="mt-4 max-w-lg mx-auto text-sm md:text-base text-primary-foreground/90 leading-relaxed"
          >
            {descripcion}
          </motion.p>
        )}
      </motion.div>

      {subtitulo2 && (
        <motion.div
          variants={descVariants}
          transition={{ duration: shouldReduceMotion ? 0 : 0.6, delay: shouldReduceMotion ? 0 : 0.5 }}
          className="relative z-10 mt-6 flex items-center gap-3"
        >
          <div className="h-px w-12 bg-primary-foreground/40" />
          <p className="text-sm uppercase tracking-widest text-primary-foreground/60">
            {subtitulo2}
          </p>
          <div className="h-px w-12 bg-primary-foreground/40" />
        </motion.div>
      )}
    </div>
  )
}
