interface MarqueeProps {
  palabras: string[];
}

function pista(palabras: string[], copia: number) {
  return palabras.flatMap((palabra, idx) => [
    <span key={`${copia}-p-${idx}`} className="text-background">
      {palabra}
    </span>,
    <span key={`${copia}-s-${idx}`} className="text-background/40">
      ·
    </span>,
  ]);
}

// Cinta de platos en movimiento (".marquee" de la referencia). Decorativa:
// oculta a lectores de pantalla y quieta con prefers-reduced-motion.
export function Marquee({ palabras }: Readonly<MarqueeProps>) {
  if (palabras.length === 0) return null;

  return (
    <div aria-hidden="true" className="relative overflow-hidden border-y border-primary bg-foreground py-7">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, color-mix(in oklch, var(--background) 4%, transparent) 0 2px, transparent 2px 20px)",
        }}
      />
      <div className="flex w-max animate-landing-marquee gap-12 whitespace-nowrap font-serif text-[clamp(28px,3.4vw,52px)] font-light italic tracking-[-0.01em] motion-reduce:animate-none">
        {pista(palabras, 0)}
        {pista(palabras, 1)}
      </div>
    </div>
  );
}
