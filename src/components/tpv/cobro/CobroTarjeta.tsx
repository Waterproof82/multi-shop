'use client';

interface Props {
  readonly totalFinalCents: number;
  readonly propinaCents: number;
  readonly baseCents: number;
  readonly loading: boolean;
  readonly onConfirmar: () => void;
  readonly onBack: () => void;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

export function CobroTarjeta({
  totalFinalCents,
  propinaCents,
  baseCents,
  loading,
  onConfirmar,
  onBack,
}: Props) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <span className="text-6xl">💳</span>
        <p className="text-4xl font-bold">{fmt(totalFinalCents)}</p>
        {propinaCents > 0 && (
          <p className="text-sm text-[#6b7280]">
            {fmt(baseCents)} consumo + {fmt(propinaCents)} propina
          </p>
        )}
        <p className="text-sm text-[#6b7280] leading-relaxed max-w-xs">
          Introduce el importe exacto en el datáfono y espera la confirmación del banco antes de
          confirmar aquí.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirmar}
          className="w-full py-4 rounded-xl bg-[#22c55e] text-white font-bold text-base disabled:opacity-40 hover:brightness-110 transition-all"
        >
          {loading ? 'Procesando...' : 'Confirmar pago con tarjeta'}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="py-3 px-8 rounded-xl border border-[#e2e8f0] text-[#64748b] text-sm font-semibold hover:text-[#0f172a] transition-colors"
        >
          ← Cambiar método
        </button>
      </div>
    </div>
  );
}
