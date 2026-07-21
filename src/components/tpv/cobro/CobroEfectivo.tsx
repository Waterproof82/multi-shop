'use client';

import { useState, useMemo } from 'react';

interface Props {
  readonly totalFinalCents: number;
  readonly loading: boolean;
  readonly onConfirmar: (entregadoCents: number) => void;
  readonly onBack: () => void;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

function buildQuickAmounts(totalCents: number): number[] {
  const total = totalCents / 100;
  const r = (n: number) => Math.ceil(total / n) * n;
  return [...new Set([Math.ceil(total), r(5), r(10), r(10) + 10])]
    .filter(n => n * 100 >= totalCents)
    .slice(0, 4);
}

const NUMPAD = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'] as const;

export function CobroEfectivo({ totalFinalCents, loading, onConfirmar, onBack }: Props) {
  const [raw, setRaw] = useState(String(Math.ceil(totalFinalCents / 100)));
  const entregadoCents = useMemo(() => Math.round(parseFloat(raw || '0') * 100), [raw]);
  const changeCents = entregadoCents - totalFinalCents;
  const quickAmounts = useMemo(() => buildQuickAmounts(totalFinalCents), [totalFinalCents]);

  function handlePad(key: string) {
    if (key === '⌫') {
      setRaw(r => r.slice(0, -1) || '0');
      return;
    }
    if (key === '.' && raw.includes('.')) return;
    setRaw(r => (r === '0' ? (key === '.' ? '0.' : key) : r + key));
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-6 p-8">
      <div className="flex flex-col gap-4 flex-1 max-w-xs">
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4">
          <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider mb-1">
            Entrega el cliente
          </p>
          <p className="text-3xl font-bold tabular-nums">{fmt(entregadoCents)}</p>
        </div>
        <div
          className={`rounded-xl p-4 border ${
            changeCents >= 0
              ? 'bg-[#22c55e15] border-[#22c55e44]'
              : 'bg-[#ef444415] border-[#ef444444]'
          }`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
              changeCents >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
            }`}
          >
            Cambio a devolver
          </p>
          <p
            className={`text-3xl font-bold tabular-nums ${
              changeCents >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
            }`}
          >
            {changeCents >= 0 ? fmt(changeCents) : '− ' + fmt(Math.abs(changeCents))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setRaw(String(n))}
              className="px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm font-semibold hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
            >
              {n} €
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRaw(String(Math.ceil(totalFinalCents / 100)))}
            className="px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm font-semibold hover:border-[#2563eb] hover:text-[#2563eb] transition-colors"
          >
            Exacto
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 w-48">
        <div className="grid grid-cols-3 gap-2">
          {NUMPAD.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => handlePad(k)}
              className={`py-4 rounded-xl border text-lg font-bold transition-colors ${
                k === '⌫'
                  ? 'bg-[#f8fafc] border-[#e2e8f0] text-[#ef4444] hover:bg-[#fef2f2]'
                  : 'bg-[#f8fafc] border-[#e2e8f0] hover:bg-[#e2e8f0]'
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={entregadoCents < totalFinalCents || loading}
          onClick={() => onConfirmar(entregadoCents)}
          className="w-full py-4 rounded-xl bg-[#22c55e] text-white font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          {loading ? 'Procesando...' : `Cobrar ${fmt(totalFinalCents)}`}
        </button>
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3 rounded-xl border border-[#e2e8f0] text-[#64748b] text-sm font-semibold hover:text-[#0f172a] transition-colors"
        >
          ← Volver
        </button>
      </div>
    </div>
  );
}
