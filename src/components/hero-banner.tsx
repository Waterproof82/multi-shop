"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { useLanguage } from "@/lib/language-context"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface HeroBannerProps {
  readonly empresa?: EmpresaPublic | null;
}

export function HeroBanner({ empresa }: HeroBannerProps) {
  const { language } = useLanguage()
  
  const logoUrl = empresa?.logoUrl ?? null
  const urlImage = empresa?.urlImage ?? null
  
  const titulo = empresa?.titulo ?? null
  const subtitulo = empresa?.subtitulo ?? null
  const subtitulo2 = empresa?.subtitulo2?.[language] ?? empresa?.subtitulo2?.es ?? null
  const descripcion = empresa?.descripcion?.[language] ?? empresa?.descripcion?.es ?? null

  const showTitulo = titulo !== null && titulo !== ""
  const showSubtitulo = subtitulo !== null && subtitulo !== ""

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden bg-primary px-4 py-16 text-center md:py-24">
      {urlImage && (
        <div 
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `url("${urlImage}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}
      <div className="absolute inset-0 opacity-10 z-0">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fillRule='evenodd'%3E%3Cg fill='%23ffffff' fillOpacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10"
      >
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={empresa?.nombre ?? "Logo"}
            width={200}
            height={100}
            className="mx-auto mb-6 h-24 w-auto md:h-32"
            unoptimized
          />
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative z-10"
      >
        {showTitulo && (
          <h1 className="font-serif text-4xl font-bold tracking-tight text-primary-foreground md:text-6xl">
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-4 max-w-lg mx-auto text-sm md:text-base text-primary-foreground/90 leading-relaxed"
          >
            {descripcion}
          </motion.p>
        )}
      </motion.div>

      {subtitulo2 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
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
