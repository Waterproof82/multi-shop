import { ImagenSubida as Image } from "@/components/ui/imagen-subida";

export type MarqueeModo = "palabras" | "imagenes";

interface MarqueeProps {
  modo: MarqueeModo;
  /** Palabras o URLs de imagen, según `modo`. */
  items: string[];
}

function pistaPalabras(palabras: string[], copia: number) {
  return palabras.flatMap((palabra, idx) => [
    <span key={`${copia}-p-${idx}`} className="text-background">
      {palabra}
    </span>,
    <span key={`${copia}-s-${idx}`} className="text-background/40">
      ·
    </span>,
  ]);
}

// Iconos/logos subidos por el admin (ya a 480px WebP): alto fijo, ancho libre.
function pistaImagenes(imagenes: string[], copia: number) {
  return imagenes.map((url, idx) => (
    <span key={`${copia}-i-${idx}`} className="relative block h-[clamp(40px,4.6vw,72px)] w-[clamp(64px,7vw,120px)]">
      <Image src={url} alt="" fill sizes="120px" className="object-contain" />
    </span>
  ));
}

// Cinta en movimiento (".marquee" de la referencia): palabras o imágenes.
// Decorativa: oculta a lectores de pantalla y quieta con prefers-reduced-motion.
export function Marquee({ modo, items }: Readonly<MarqueeProps>) {
  if (items.length === 0) return null;

  const pista = modo === "imagenes" ? pistaImagenes : pistaPalabras;

  return (
    <div aria-hidden="true" className="relative overflow-hidden border-y border-primary bg-foreground py-7">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, color-mix(in oklch, var(--background) 4%, transparent) 0 2px, transparent 2px 20px)",
        }}
      />
      <div className="flex w-max animate-landing-marquee items-center gap-12 whitespace-nowrap font-serif text-[clamp(28px,3.4vw,52px)] font-light italic tracking-[-0.01em] motion-reduce:animate-none">
        {pista(items, 0)}
        {pista(items, 1)}
      </div>
    </div>
  );
}
