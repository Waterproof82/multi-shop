"use client";

import { useState } from "react";
import type { ProductoTablaVM, TablaFilaVM, TablaCeldaVM } from "@/core/application/dtos/menu-view-model";
import { ImagenSubida } from "@/components/ui/imagen-subida";
import { ImageZoomDialog } from "@/components/image-zoom-dialog";
import { t } from "@/lib/translations";

// `Lang` según la firma real de t() (regla del repo: no cast a secas).
type Lang = Parameters<typeof t>[1];

type LanguageKey = "en" | "fr" | "it" | "de";

function asLanguageKey(language: string): LanguageKey | undefined {
  return (["en", "fr", "it", "de"].includes(language) ? language : undefined) as LanguageKey | undefined;
}

/**
 * Normaliza las filas VM al shape `{ celdas, imagen? }`. La cache de menú
 * (`unstable_cache`, TTL 1h) guarda el SERIALIZADO con el shape que había en
 * el deploy: la cache vieja contiene `filas: [[celda]]` (legacy, sin `celdas`)
 * y seguirá sirviéndose hasta expirar porque `revalidateTag` solo corre al
 * guardar desde el admin. Otros consumidores ya toleran los dos shapes
 * (`tablaDesdeApi`/`filaDesdeApi` en dominio); aquí lo protege el propio
 * render para que la transición no rompa la ficha de producto.
 */
function normalizarFilasVM(filas: TablaFilaVM[] | undefined): TablaFilaVM[] {
  if (!Array.isArray(filas)) return [];
  return filas.map((fila) =>
    Array.isArray(fila) ? { celdas: fila as TablaCeldaVM[] } : fila
  );
}

function resolveCelda(celda: TablaCeldaVM, language: string): string {
  const lang = asLanguageKey(language);
  if (lang && celda[lang]) return celda[lang];
  return celda.es;
}

function filaKey(fila: TablaFilaVM): string {
  return fila.celdas.map((celda) => celda.es).join("|");
}

// Pie de la ampliación: la primera celda con texto de la fila (modelo,
// referencia...). Si la fila está vacía, cae al nombre del apartado.
function captionDeFila(fila: TablaFilaVM, language: string): string {
  return fila.celdas.map((celda) => resolveCelda(celda, language)).find(Boolean) ?? '';
}

interface ImagenAmpliada {
  src: string;
  alt: string;
}

function zoomDeFila(fila: TablaFilaVM, language: string): ImagenAmpliada | null {
  if (!fila.imagen) return null;
  return {
    src: fila.imagen,
    alt: captionDeFila(fila, language) || t('productTableImageLabel', language as Lang),
  };
}

function ariaZoomDeFila(fila: TablaFilaVM, language: string): string {
  // Mismo label que la carta y el carrito para la misma acción.
  const etiqueta = t('viewImage', language as Lang);
  const caption = captionDeFila(fila, language);
  return caption ? `${etiqueta}: ${caption}` : etiqueta;
}

function zipCeldaConColumna(
  fila: TablaFilaVM,
  columnas: TablaCeldaVM[]
): { celda: TablaCeldaVM; columnaKey: string }[] {
  return fila.celdas.map((celda, idx) => ({ celda, columnaKey: columnas[idx]?.es ?? celda.es }));
}

function ImagenFila({ src, ariaLabel, onZoom }: Readonly<{ src: string; ariaLabel: string; onZoom: () => void }>) {
  // Miniatura de la fila: `ImagenSubida` porque la imagen ya viene optimizada
  // (480px WebP) desde el uploader del admin y no debe re-optimizarse. Al
  // pulsarla se amplía con el MISMO diálogo que las fotos de producto.
  return (
    <button
      type="button"
      onClick={onZoom}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="relative block h-11 w-11 flex-shrink-0 rounded-md overflow-hidden border border-border/50 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <ImagenSubida src={src} alt="" fill sizes="44px" className="object-cover" />
    </button>
  );
}

function ProductTableRowMobile({ fila, columnas, language, startIndex, onZoom }: Readonly<{
  fila: TablaFilaVM;
  columnas: TablaCeldaVM[];
  language: string;
  startIndex: number;
  onZoom: () => void;
}>) {
  const contenido = zipCeldaConColumna(fila, columnas).map(({ celda, columnaKey }, idx) => {
    const isOdd = (startIndex + idx) % 2 === 1;
    return (
      <div
        key={columnaKey}
        className={`grid grid-cols-2 gap-2 px-3 py-2 border-b border-border last:border-b-0 ${isOdd ? "bg-muted/30" : "bg-primary/5"}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          {resolveCelda(columnas[idx] ?? celda, language)}
        </span>
        <span className="text-sm text-foreground">{resolveCelda(celda, language)}</span>
      </div>
    );
  });

  if (!fila.imagen) return <>{contenido}</>;

  return (
    <div className="flex flex-col">
      <div className="px-3 pt-2">
        <ImagenFila src={fila.imagen} ariaLabel={ariaZoomDeFila(fila, language)} onZoom={onZoom} />
      </div>
      {contenido}
    </div>
  );
}

export function ProductTable({ table, language }: Readonly<{ table: ProductoTablaVM; language: string }>) {
  const [imagenAmpliada, setImagenAmpliada] = useState<ImagenAmpliada | null>(null);
  const filas = normalizarFilasVM(table.filas);
  const conImagen = filas.some((fila) => Boolean(fila.imagen));

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-xs">
      <div className="md:hidden">
        {filas.map((fila, r) => (
          <ProductTableRowMobile
            key={filaKey(fila)}
            fila={fila}
            columnas={table.columnas}
            language={language}
            startIndex={r * table.columnas.length}
            onZoom={() => setImagenAmpliada(zoomDeFila(fila, language))}
          />
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-primary/10">
              {conImagen && (
                <th scope="col" className="w-12 px-3 py-2">
                  <span className="sr-only">{t('productTableImageLabel', language as Lang)}</span>
                </th>
              )}
              {table.columnas.map((columna) => (
                <th
                  key={columna.es}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary border-r border-border last:border-r-0"
                >
                  {resolveCelda(columna, language)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((fila, r) => (
              <tr key={filaKey(fila)} className={r % 2 === 1 ? "bg-muted/30" : "bg-primary/5"}>
                {conImagen && (
                  <td className="px-3 py-2">
                    {fila.imagen ? (
                      <ImagenFila
                        src={fila.imagen}
                        ariaLabel={ariaZoomDeFila(fila, language)}
                        onZoom={() => setImagenAmpliada(zoomDeFila(fila, language))}
                      />
                    ) : null}
                  </td>
                )}
                {zipCeldaConColumna(fila, table.columnas).map(({ celda, columnaKey }) => (
                  <td key={columnaKey} className="px-3 py-2 text-foreground border-r border-border last:border-r-0">
                    {resolveCelda(celda, language)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ImageZoomDialog
        images={imagenAmpliada ? [imagenAmpliada.src] : []}
        alt={imagenAmpliada?.alt ?? ''}
        open={imagenAmpliada !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setImagenAmpliada(null);
        }}
      />
    </div>
  );
}
