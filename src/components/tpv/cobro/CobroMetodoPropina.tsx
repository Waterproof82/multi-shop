'use client';

import { useState } from 'react';
import type { MetodoPago } from '@/core/domain/entities/tpv-types';

interface Props {
  readonly totalCents: number;
  readonly yaCobradoCents: number;
  readonly totalPendienteCents: number;
  readonly importeParcialCents: number;
  readonly metodo: MetodoPago;
  readonly propinaCents: number;
  readonly descuentoCents: number;
  readonly onImporteChange: (cents: number) => void;
  readonly onMetodoChange: (m: MetodoPago) => void;
  readonly onPropinaChange: (cents: number) => void;
  readonly onDescuentoChange: (cents: number) => void;
  readonly onContinuar: () => void;
  readonly onCancel: () => void;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

const QUICK_TIPS = [100, 200, 500] as const;

export function CobroMetodoPropina({
  totalCents,
  yaCobradoCents,
  totalPendienteCents,
  importeParcialCents,
  metodo,
  propinaCents,
  descuentoCents,
  onImporteChange,
  onMetodoChange,
  onPropinaChange,
  onDescuentoChange,
  onContinuar,
  onCancel,
}: Props) {
  const efectivoPendienteCents = totalPendienteCents - descuentoCents;
  const esParcial = importeParcialCents < efectivoPendienteCents;
  const totalFinal = importeParcialCents + propinaCents;

  const [rawImporte, setRawImporte] = useState((importeParcialCents / 100).toFixed(2));
  const [rawDescuento, setRawDescuento] = useState((descuentoCents / 100).toFixed(2));

  function handlePropinaInput(val: string) {
    const euros = parseFloat(val.replace(',', '.')) || 0;
    onPropinaChange(Math.round(euros * 100));
  }

  function handleImporteChange(val: string) {
    setRawImporte(val);
    const euros = parseFloat(val.replace(',', '.')) || 0;
    const cents = Math.round(euros * 100);
    onImporteChange(Math.min(Math.max(cents, 0), efectivoPendienteCents));
  }

  function handleImporteBlur() {
    const euros = parseFloat(rawImporte.replace(',', '.')) || 0;
    const cents = Math.min(Math.max(Math.round(euros * 100), 1), efectivoPendienteCents);
    onImporteChange(cents);
    setRawImporte((cents / 100).toFixed(2));
  }

  function resetImporteToTotal() {
    onImporteChange(efectivoPendienteCents);
    setRawImporte((efectivoPendienteCents / 100).toFixed(2));
  }

  function handleDescuentoChange(val: string) {
    setRawDescuento(val);
    const euros = parseFloat(val.replace(',', '.')) || 0;
    const cents = Math.min(Math.round(euros * 100), totalPendienteCents - 1);
    onDescuentoChange(Math.max(cents, 0));
    onImporteChange(Math.max(totalPendienteCents - Math.max(cents, 0), 1));
    setRawImporte(((Math.max(totalPendienteCents - Math.max(cents, 0), 1)) / 100).toFixed(2));
  }

  function handleDescuentoBlur() {
    const euros = parseFloat(rawDescuento.replace(',', '.')) || 0;
    const cents = Math.min(Math.max(Math.round(euros * 100), 0), totalPendienteCents - 1);
    onDescuentoChange(cents);
    onImporteChange(totalPendienteCents - cents);
    setRawDescuento((cents / 100).toFixed(2));
    setRawImporte(((totalPendienteCents - cents) / 100).toFixed(2));
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-6 p-8">
      {/* Resumen lateral */}
      <div className="w-56 bg-white border border-[#e2e8f0] rounded-2xl p-5 flex flex-col gap-3 self-start shadow-sm">
        <p className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">Resumen</p>
        <div className="flex justify-between text-sm text-[#6b7280]">
          <span>Consumo total</span><span>{fmt(totalCents)}</span>
        </div>
        {yaCobradoCents > 0 && (
          <div className="flex justify-between text-sm text-[#22c55e]">
            <span>Ya cobrado</span><span>− {fmt(yaCobradoCents)}</span>
          </div>
        )}
        {yaCobradoCents > 0 && (
          <div className="flex justify-between text-sm font-semibold">
            <span>Pendiente</span><span>{fmt(totalPendienteCents)}</span>
          </div>
        )}
        {descuentoCents > 0 && (
          <div className="flex justify-between text-sm text-[#ef4444]">
            <span>Descuento</span><span>− {fmt(descuentoCents)}</span>
          </div>
        )}
        {propinaCents > 0 && (
          <div className="flex justify-between text-sm text-[#eab308]">
            <span>Propina</span><span>{fmt(propinaCents)}</span>
          </div>
        )}
        <div className="h-px bg-[#e2e8f0]" />
        <div className="flex justify-between items-baseline">
          <span className="text-sm text-[#6b7280]">{esParcial ? 'A COBRAR' : 'TOTAL'}</span>
          <span className="text-2xl font-bold">{fmt(totalFinal)}</span>
        </div>
        {esParcial && (
          <div className="text-[10px] text-[#f97316] font-semibold text-center bg-[#f9731615] border border-[#f9731640] rounded-lg py-1">
            Cobro parcial
          </div>
        )}
      </div>

      {/* Panel principal */}
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-7 flex flex-col gap-6 w-[420px] shadow-sm">
        <h2 className="text-lg font-bold">¿Cómo paga el cliente?</h2>

        {/* Importe a cobrar */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">
            Importe a cobrar
          </label>
          <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 focus-within:border-[#2563eb] transition-colors">
            <span className="text-[#64748b] font-semibold">€</span>
            <input
              type="text"
              inputMode="decimal"
              value={rawImporte}
              onChange={e => handleImporteChange(e.target.value)}
              onBlur={handleImporteBlur}
              onFocus={e => e.target.select()}
              className="flex-1 bg-transparent py-3 text-lg font-bold outline-none"
            />
            {esParcial && (
              <button
                type="button"
                onClick={resetImporteToTotal}
                className="text-[10px] text-[#2563eb] font-bold hover:underline shrink-0"
              >
                Total
              </button>
            )}
          </div>
          {esParcial && (
            <p className="text-[11px] text-[#6b7280]">
              Quedan {fmt(totalPendienteCents - importeParcialCents)} por cobrar tras este pago
            </p>
          )}
        </div>

        {/* Descuento */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">
            Descuento <span className="normal-case font-normal">(opcional)</span>
          </label>
          <div className="flex items-center gap-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 focus-within:border-[#ef4444] transition-colors">
            <span className="text-[#6b7280] font-semibold">€</span>
            <input
              type="text"
              inputMode="decimal"
              value={rawDescuento}
              onChange={e => handleDescuentoChange(e.target.value)}
              onBlur={handleDescuentoBlur}
              onFocus={e => e.target.select()}
              className="flex-1 bg-transparent py-2.5 text-base font-bold outline-none"
              placeholder="0.00"
            />
            {descuentoCents > 0 && (
              <button
                type="button"
                onClick={() => { onDescuentoChange(0); onImporteChange(totalPendienteCents); setRawDescuento('0.00'); setRawImporte((totalPendienteCents / 100).toFixed(2)); }}
                className="text-[10px] text-[#6b7280] hover:text-[#ef4444] font-bold shrink-0"
              >
                Quitar
              </button>
            )}
          </div>
        </div>

        {/* Método de pago */}
        <div className="grid grid-cols-2 gap-3">
          {(['efectivo', 'tarjeta'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onMetodoChange(m)}
              className={`flex flex-col items-center gap-3 py-8 px-4 rounded-xl border-2 transition-all ${
                metodo === m
                  ? 'border-[#2563eb] bg-[#eff6ff]'
                  : 'border-[#e2e8f0] bg-[#f8fafc] hover:border-[#2563eb]'
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
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4 flex flex-col gap-3">
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
              className="px-3 py-1.5 rounded-lg border border-[#e2e8f0] text-[#64748b] text-sm font-semibold hover:text-[#0f172a] transition-colors"
            >
              Sin propina
            </button>
          </div>
          <div className="flex items-center gap-2 bg-white border border-[#e2e8f0] rounded-lg px-3 focus-within:border-[#eab308] transition-colors">
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
            className="flex-1 py-3 rounded-xl border border-[#e2e8f0] text-[#64748b] text-sm font-semibold hover:text-[#0f172a] hover:border-[#cbd5e1] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinuar}
            className="flex-[2] py-3 rounded-xl bg-[#2563eb] text-white font-bold hover:brightness-110 transition-all"
          >
            Continuar — {fmt(totalFinal)}
          </button>
        </div>
      </div>
    </div>
  );
}
