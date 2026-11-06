import type { ProductoTablaVM, TablaFilaVM, TablaCeldaVM } from "@/core/application/dtos/menu-view-model";
import { ImagenSubida } from "@/components/ui/imagen-subida";
import { t } from "@/lib/translations";

// `Lang` según la firma real de t() (regla del repo: no cast a secas).
type Lang = Parameters<typeof t>[1];

type LanguageKey = "en" | "fr" | "it" | "de";

function asLanguageKey(language: string): LanguageKey | undefined {
  return (["en", "fr", "it", "de"].includes(language) ? language : undefined) as LanguageKey | undefined;
}

function resolveCelda(celda: TablaCeldaVM, language: string): string {
  const lang = asLanguageKey(language);
  if (lang && celda[lang]) return celda[lang];
  return celda.es;
}

function filaKey(fila: TablaFilaVM): string {
  return fila.celdas.map((celda) => celda.es).join("|");
}

function tieneImagen(table: ProductoTablaVM): boolean {
  return table.filas.some((fila) => Boolean(fila.imagen));
}

function zipCeldaConColumna(
  fila: TablaFilaVM,
  columnas: TablaCeldaVM[]
): { celda: TablaCeldaVM; columnaKey: string }[] {
  return fila.celdas.map((celda, idx) => ({ celda, columnaKey: columnas[idx]?.es ?? celda.es }));
}

function ImagenFila({ src }: Readonly<{ src: string }>) {
  // Miniatura decorativa de la fila: la información ya está en la fila;
  // `ImagenSubida` porque la imagen ya viene optimizada (480px WebP)
  // desde el uploader del admin y no debe re-optimizarse.
  return (
    <span className="relative block h-10 w-10 rounded-md overflow-hidden border border-border/50 bg-muted flex-shrink-0">
      <ImagenSubida src={src} alt="" fill sizes="40px" className="object-cover" />
    </span>
  );
}

function ProductTableRowMobile({ fila, columnas, language, startIndex }: Readonly<{
  fila: TablaFilaVM;
  columnas: TablaCeldaVM[];
  language: string;
  startIndex: number;
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
        <ImagenFila src={fila.imagen} />
      </div>
      {contenido}
    </div>
  );
}

export function ProductTable({ table, language }: Readonly<{ table: ProductoTablaVM; language: string }>) {
  const conImagen = tieneImagen(table);

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-xs">
      <div className="md:hidden">
        {table.filas.map((fila, r) => (
          <ProductTableRowMobile
            key={filaKey(fila) + fila.imagen}
            fila={fila}
            columnas={table.columnas}
            language={language}
            startIndex={r * table.columnas.length}
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
            {table.filas.map((fila, r) => (
              <tr key={filaKey(fila) + fila.imagen} className={r % 2 === 1 ? "bg-muted/30" : "bg-primary/5"}>
                {conImagen && (
                  <td className="px-3 py-2">
                    {fila.imagen ? <ImagenFila src={fila.imagen} /> : null}
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
    </div>
  );
}
