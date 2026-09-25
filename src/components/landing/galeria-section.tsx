"use client";

import { useId } from "react";
import { ImagenSubida as Image } from "@/components/ui/imagen-subida";
import { useLanguage } from "@/lib/language-context";
import { readTranslatable } from "@/lib/landing/read-translatable";
import { t } from "@/lib/translations";
import { Eyebrow, TituloResaltado, landingH2, landingPadX, tituloPlano } from "@/components/landing/landing-ui";

interface GaleriaSectionProps {
  contenido: Record<string, unknown>;
  /** Para el `alt` de cada foto: el admin no escribe uno por imagen. */
  empresaNombre: string;
}

function imagenesValidas(contenido: Record<string, unknown>): string[] {
  if (!Array.isArray(contenido.imagenes)) return [];
  return contenido.imagenes.filter((url): url is string => typeof url === "string" && url.length > 0);
}

// Rejilla segun cuantas fotos haya, para que la ultima fila quede SIEMPRE
// completa (sin fotos huerfanas):
// - Movil (2 columnas): si el total es impar, la primera ocupa el ancho entero.
// - Escritorio: 1-4 fotos en una fila; con 5 o mas, 4 columnas con fotos
//   destacadas (2x2 = 4 celdas, "ancha" = 2 celdas) elegidas para que el total
//   de celdas sea multiplo de 4, o 3 columnas si el total es multiplo de 3.
interface LayoutEscritorio {
  cols: 3 | 4;
  grandes: number[];
  anchas: number[];
}

function layoutEscritorio(total: number): LayoutEscritorio {
  const resto = total % 4;
  if (resto === 0) return { cols: 4, grandes: [], anchas: [] };
  if (resto === 1) return { cols: 4, grandes: [0], anchas: [] };
  if (resto === 3) return { cols: 4, grandes: [], anchas: [0] };
  if (total % 3 === 0) return { cols: 3, grandes: [], anchas: [] };
  return { cols: 4, grandes: [0, 5], anchas: [] };
}

export function gridGaleriaClass(total: number): string {
  if (total === 1) return "mx-auto max-w-4xl grid-cols-1";
  if (total === 2) return "grid-cols-2";
  if (total === 3) return "grid-cols-2 md:grid-cols-3";
  if (total === 4) return "grid-cols-2 lg:grid-cols-4";
  if (layoutEscritorio(total).cols === 3) return "grid-flow-dense grid-cols-2 md:grid-cols-3";
  return "grid-flow-dense grid-cols-2 md:grid-cols-4";
}

function claseMovil(total: number, idx: number): string {
  if (total % 2 === 1 && idx === 0) return "col-span-2 aspect-[16/10]";
  return "aspect-[3/4]";
}

function claseEscritorio(total: number, idx: number): string {
  const layout = layoutEscritorio(total);
  if (layout.grandes.includes(idx)) return "md:col-span-2 md:row-span-2 md:aspect-auto";
  if (layout.anchas.includes(idx)) return "md:col-span-2 md:aspect-auto";
  return "md:col-span-1 md:aspect-[3/4]";
}

export function itemGaleriaClass(total: number, idx: number): string {
  if (total === 1) return "aspect-[16/10]";
  if (total <= 4) return `${claseMovil(total, idx)} md:col-span-1 md:aspect-[3/4]`;
  return `${claseMovil(total, idx)} ${claseEscritorio(total, idx)}`;
}

function sizesGaleria(total: number, idx: number): string {
  if (total === 1) return "(max-width: 900px) 100vw, 900px";
  if (idx === 0) return "(max-width: 768px) 100vw, 50vw";
  return "(max-width: 768px) 50vw, 25vw";
}

/**
 * `alt` de cada foto. Sin texto por imagen, lo mas descriptivo que hay es el
 * titulo de la seccion + el negocio: "El local · La Mermelada (2 de 5)" dice
 * a Google Imagenes y al lector de pantalla DE QUE es la foto, no solo que
 * es "Imagen 2".
 */
export function altGaleria(titulo: string, empresaNombre: string, idx: number, total: number): string {
  const base = `${tituloPlano(titulo).trim()} · ${empresaNombre}`;
  return total > 1 ? `${base} (${idx + 1}/${total})` : base;
}

export function GaleriaSection({ contenido, empresaNombre }: Readonly<GaleriaSectionProps>) {
  const { language } = useLanguage();
  const kicker = readTranslatable(contenido, "kicker", language);
  const titulo = readTranslatable(contenido, "titulo", language) ?? t("landingGaleriaTituloDefault", language);
  const imagenes = imagenesValidas(contenido);
  const tituloId = useId();

  if (imagenes.length === 0) return null;

  return (
    <section id="galeria" aria-labelledby={tituloId} className={`mx-auto w-full max-w-7xl py-[clamp(56px,8vw,110px)] ${landingPadX}`}>
      <div className="mb-[38px] max-w-[46ch]">
        {kicker && <Eyebrow solo>{kicker}</Eyebrow>}
        <h2 id={tituloId} className={landingH2}>
          <TituloResaltado texto={titulo} />
        </h2>
      </div>
      <ul className={`m-0 grid list-none gap-3.5 p-0 ${gridGaleriaClass(imagenes.length)}`}>
        {imagenes.map((url, idx) => (
          <li
            key={`${url}-${idx}`}
            className={`group relative overflow-hidden rounded-[26px] bg-muted shadow-[0_2px_10px_color-mix(in_oklch,var(--foreground)_8%,transparent)] ${itemGaleriaClass(imagenes.length, idx)}`}
          >
            <Image
              src={url}
              alt={altGaleria(titulo, empresaNombre, idx, imagenes.length)}
              fill
              sizes={sizesGaleria(imagenes.length, idx)}
              className="object-cover transition-transform duration-[600ms] ease-out group-hover:scale-105 motion-reduce:transition-none"
              loading="lazy"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
