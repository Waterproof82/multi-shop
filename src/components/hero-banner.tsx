"use client"

import { motion } from "framer-motion"

export function HeroBanner() {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden bg-primary px-4 py-16 text-center md:py-24">
      <div className="absolute inset-0 opacity-10">
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
        <img
          src="MERMELADA-TOMATE-web-transp-sombra-1920w.webp"
          alt="Mermelada de Tomate"
          className="mx-auto mb-6 h-24 w-auto md:h-32"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative z-10"
      >
        <h1 className="font-serif text-4xl font-bold tracking-tight text-primary-foreground md:text-6xl">
          BENVENUTI
        </h1>
        <p className="mt-2 font-serif text-xl italic text-primary-foreground/80 md:text-2xl">
          Buon appetito!
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="relative z-10 mt-6 flex items-center gap-3"
      >
        <div className="h-px w-12 bg-primary-foreground/40" />
        <p className="text-sm uppercase tracking-widest text-primary-foreground/60">
          Nuestra Carta
        </p>
        <div className="h-px w-12 bg-primary-foreground/40" />
      </motion.div>
    </div>
  )
}
