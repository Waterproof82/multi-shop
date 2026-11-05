import type { ProductoTablaVM, TablaCeldaVM } from "@/core/application/dtos/menu-view-model";

type LanguageKey = "en" | "fr" | "it" | "de";

function asLanguageKey(language: string): LanguageKey | undefined {
  return (["en", "fr", "it", "de"].includes(language) ? language : undefined) as LanguageKey | undefined;
}

function resolveCelda(celda: TablaCeldaVM, language: string): string {
  const lang = asLanguageKey(language);
  if (lang && celda[lang]) return celda[lang];
  return celda.es;
}

function filaKey(fila: TablaCeldaVM[]): string {
  return fila.map((celda) => celda.es).join("|");
}

function zipCeldaConColumna(
  fila: TablaCeldaVM[],
  columnas: TablaCeldaVM[]
): { celda: TablaCeldaVM; columnaKey: string }[] {
  return fila.map((celda, idx) => ({ celda, columnaKey: columnas[idx]?.es ?? celda.es }));
}

function ProductTableRowMobile({ fila, columnas, language, startIndex }: Readonly<{
  fila: TablaCeldaVM[];
  columnas: TablaCeldaVM[];
  language: string;
  startIndex: number;
}>) {
  return (
    <>
      {zipCeldaConColumna(fila, columnas).map(({ celda, columnaKey }, idx) => {
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
      })}
    </>
  );
}

export function ProductTable({ table, language }: Readonly<{ table: ProductoTablaVM; language: string }>) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-xs">
      <div className="md:hidden">
        {table.filas.map((fila, r) => (
          <ProductTableRowMobile
            key={filaKey(fila)}
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
              <tr key={filaKey(fila)} className={r % 2 === 1 ? "bg-muted/30" : "bg-primary/5"}>
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
