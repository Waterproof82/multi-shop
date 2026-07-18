'use client';

interface PrintButtonProps {
  label?: string;
}

export function PrintButton({ label = 'Imprimir' }: Readonly<PrintButtonProps>) {
  return (
    <button
      type="button"
      onClick={() => globalThis.print()}
      className="no-print px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
    >
      {label}
    </button>
  );
}
