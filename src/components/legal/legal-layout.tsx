import Link from 'next/link';
import type { ReactNode } from 'react';

export const ACTUALIZACION_TEXTOS_LEGALES = '2026-09-30';

export function LegalPage({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <main id="main-content" className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-10 flex flex-col gap-8">
        <div className="flex items-start justify-between gap-4 border-b border-foreground/15 pb-6">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Información legal</p>
            <h1 className="font-serif font-normal text-3xl">{titulo}</h1>
            <p className="text-sm text-muted-foreground mt-1">Última actualización: {ACTUALIZACION_TEXTOS_LEGALES}</p>
          </div>
          <Link href="/" className="shrink-0 inline-flex min-h-[44px] items-center text-sm text-muted-foreground hover:text-foreground underline">
            ← Volver
          </Link>
        </div>
        {children}
      </div>
    </main>
  );
}

export function Section({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-serif font-normal text-xl text-foreground border-b border-foreground/10 pb-2">{titulo}</h2>
      <div className="flex flex-col gap-2 text-sm text-foreground leading-relaxed">{children}</div>
    </section>
  );
}

export function InfoTable({ rows }: Readonly<{ rows: ([string, string] | null)[] }>) {
  const validRows = rows.filter((r): r is [string, string] => r !== null);
  if (validRows.length === 0) return null;
  return (
    <dl className="rounded-[3px] border border-foreground/10 p-3 flex flex-col gap-1.5 text-sm">
      {validRows.map(([label, value]) => (
        <div key={label} className="flex flex-col sm:flex-row sm:gap-2">
          <dt className="text-muted-foreground shrink-0 sm:w-44">{label}:</dt>
          <dd className="font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Texto libre del tenant: SIEMPRE texto plano (React escapa); nunca HTML. */
export function TextoAdicional({ texto }: Readonly<{ texto: string | null }>) {
  if (texto === null) return null;
  return (
    <Section titulo="Condiciones adicionales">
      <p className="whitespace-pre-line">{texto}</p>
    </Section>
  );
}

export function TablaSimple({ cabeceras, filas }: Readonly<{ cabeceras: readonly string[]; filas: readonly (readonly string[])[] }>) {
  return (
    <div className="overflow-x-auto rounded-[3px] border border-foreground/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-foreground/10">
            {cabeceras.map((c) => (
              <th key={c} scope="col" className="text-left p-2 font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/10">
          {filas.map((fila, i) => (
            <tr key={`${i}-${fila.join('|')}`}>
              {fila.map((celda, j) => (
                <td key={`${cabeceras[j]}-${celda}`} className="p-2">{celda}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
