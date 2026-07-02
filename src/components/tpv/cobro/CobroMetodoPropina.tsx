'use client';

import type { MetodoPago } from '@/core/domain/entities/tpv-types';

interface Props {
  readonly totalCents: number;
  readonly metodo: MetodoPago;
  readonly propinaCents: number;
  readonly onMetodoChange: (m: MetodoPago) => void;
  readonly onPropinaChange: (cents: number) => void;
  readonly onContinuar: () => void;
  readonly onCancel: () => void;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

const QUICK_TIPS = [100, 200, 500] as const;

export function CobroMetodoPropina({
  totalCents,
  metodo,
  propinaCents,
  onMetodoChange,
  onPropinaChange,
  onContinuar,
  onCancel,
}: Props) {
  const totalFinal = totalCents + propinaCents;

  function handlePropinaInput(val: string) {
    const euros = parseFloat(val.replace(',', '.')) || 0;
    onPropinaChange(Math.round(euros * 100));
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-6 p-8">
      {/* Resumen lateral */}
      <div className="w-56 bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-5 flex flex-col gap-3 self-start">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Resumen</p>
        <div className="flex justify-between text-sm text-[#6b7280]">
          <span>Consumo</span><span>{fmt(totalCents)}</span>
        </div>
        {propinaCents > 0 && (
          <div className="flex justify-between text-sm text-[#eab308]">
            <span>Propina</span><span>{fmt(propinaCents)}</span>
          </div>
        )}
        <div className="h-px bg-[#2e3347]" />
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-[#6b7280]">TOTAL</span>
          <span className="text-2xl font-bold">{fmt(totalFinal)}</span>
        </div>
      </div>

      {/* Panel principal */}
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-7 flex flex-col gap-6 w-[420px]">
        <h2 className="text-lg font-bold">¿Cómo paga el cliente?</h2>

        {/* Método de pago */}
        <div className="grid grid-cols-2 gap-3">
          {(['efectivo', 'tarjeta'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onMetodoChange(m)}
              className={`flex flex-col items-center gap-3 py-8 px-4 rounded-xl border-2 transition-all ${
                metodo === m
                  ? 'border-[#4f72ff] bg-[#4f72ff15]'
                  : 'border-[#2e3347] bg-[#22263a] hover:border-[#4f72ff]'
              }`}
            >
              <span className="text-4xl">{m === 'efectivo' ? '💵' : '💳'}</span>
              <span className="font-bold text-sm capitalize">{m}</span>
              <span className="text-[10px] text-[#6b7280] text-center">
                {m === 'efectivo' ? 'Calcular cambio' : 'Datáfono físico'}
              </span>
            </button>
          ))}
        </div>

        {/* Propina */}
        <div className="bg-[#22263a] border border-[#2e3347] rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">💰</span>
            <div>
              <p className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Propina</p>
              <p className="text-xs text-[#6b7280]">Opcional</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {QUICK_TIPS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onPropinaChange(t)}
                className="px-3 py-1.5 rounded-lg border border-[#eab30840] bg-[#eab30818] text-[#eab308] text-sm font-semibold hover:bg-[#eab30830] transition-colors"
              >
                +{fmt(t)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPropinaChange(0)}
              className="px-3 py-1.5 rounded-lg border border-[#2e3347] text-[#6b7280] text-sm font-semibold hover:text-[#e8eaf0] transition-colors"
            >
              Sin propina
            </button>
          </div>
          <div className="flex items-center gap-2 bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 focus-within:border-[#eab308] transition-colors">
            <span className="text-[#6b7280] font-semibold">€</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={(propinaCents / 100).toFixed(2)}
              onChange={e => handlePropinaInput(e.target.value)}
              className="flex-1 bg-transparent py-2.5 text-base font-bold outline-none"
              placeholder="Personalizar"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-[#2e3347] text-[#6b7280] text-sm font-semibold hover:text-[#e8eaf0] hover:border-[#e8eaf0] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinuar}
            className="flex-[2] py-3 rounded-xl bg-[#4f72ff] text-white font-bold hover:brightness-110 transition-all"
          >
            Continuar — {fmt(totalFinal)}
          </button>
        </div>
      </div>
    </div>
  );
}
