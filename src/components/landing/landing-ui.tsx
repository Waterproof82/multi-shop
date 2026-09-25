import type { ReactNode } from "react";

// Primitivas visuales compartidas por las secciones de la landing.
// Estilo "mesón cálido": eyebrow en versalitas con filetes, titulares serif
// en negrita, botones tipo pastilla y esquinas muy redondeadas. Todos los
// colores salen de los tokens del tenant (primary / foreground / muted...).

export const landingBtnPrimary =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-primary bg-primary px-[30px] py-3 text-[15px] font-extrabold text-primary-foreground transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const landingBtnGhost =
  "inline-flex min-h-[44px] items-center justify-center rounded-full border-2 border-foreground bg-transparent px-[30px] py-3 text-[15px] font-extrabold text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const landingH2 =
  "font-serif text-[clamp(32px,4.4vw,56px)] font-bold leading-[1.1] tracking-[-0.01em] text-foreground";

interface EyebrowProps {
  children: ReactNode;
  /** Sin filetes laterales (encabezados alineados a la izquierda). */
  solo?: boolean;
  className?: string;
}

export function Eyebrow({ children, solo = false, className = "" }: Readonly<EyebrowProps>) {
  const filetes = solo
    ? ""
    : "before:h-px before:w-7 before:bg-current before:opacity-50 before:content-[''] after:h-px after:w-7 after:bg-current after:opacity-50 after:content-['']";
  return (
    <p
      className={`mb-[18px] inline-flex items-center gap-3.5 text-xs font-extrabold uppercase tracking-[0.14em] text-primary ${filetes} ${className}`}
    >
      {children}
    </p>
  );
}
