"use client"

import { motion, useReducedMotion } from "framer-motion"
import Image from "next/image"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface HeroBannerProps {
  readonly empresa?: EmpresaPublic | null;
}

export function HeroBanner({ empresa }: HeroBannerProps) {
  const { language } = useLanguage()
  const shouldReduceMotion = useReducedMotion() ?? false
  
  const logoUrl = empresa?.logoUrl ?? null
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

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden bg-primary px-4 py-16 text-center md:py-24">
      {urlImage && (
        <div className="absolute inset-0 z-0">
          <Image
            src={urlImage}
            alt={empresa?.nombre ?? t("heroBackgroundAlt", language)}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-foreground/70" />
        </div>
      )}

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
