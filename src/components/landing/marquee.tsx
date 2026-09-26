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
// Tarjeta con `bg-background` para que cada logo tenga un fondo propio y sólido:
// sin ella, un logo con SVG transparente deja ver directamente el rayado
// decorativo del fondo de la cinta, que se lee como "rayas" sueltas.
function pistaImagenes(imagenes: string[], copia: number) {
  return imagenes.map((url, idx) => (
    <span
      key={`${copia}-i-${idx}`}
      className="block h-[clamp(52px,5.8vw,84px)] w-[clamp(88px,9vw,144px)] rounded-xl bg-background p-3 shadow-sm"
    >
      <span className="relative block h-full w-full">
        <Image src={url} alt="" fill sizes="144px" className="object-contain" />
      </span>
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
