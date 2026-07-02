'use client';

import type { MetodoPago } from '@/core/domain/entities/tpv-types';

interface Props {
  readonly totalFinalCents: number;
  readonly metodo: MetodoPago;
  readonly entregadoCents: number;
  readonly propinaCents: number;
  readonly mesaNumero: number;
  readonly operadorNombre: string;
  readonly onNuevaOperacion: () => void;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';
}

export function CobroConfirmado({
  totalFinalCents,
  metodo,
  entregadoCents,
  propinaCents,
  mesaNumero,
  operadorNombre,
  onNuevaOperacion,
}: Props) {
  const now = new Date();
  const hora =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const cambio = metodo === 'efectivo' ? Math.max(0, entregadoCents - totalFinalCents) : 0;

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <div className="w-20 h-20 rounded-full bg-[#22c55e22] border-2 border-[#22c55e] flex items-center justify-center text-4xl">
          ✓
        </div>
        <h2 className="text-2xl font-bold">¡Cobrado!</h2>
        <p className="text-sm text-[#6b7280]">
          Mesa {mesaNumero} · {operadorNombre}
        </p>

        <div className="w-full bg-[#22263a] border border-[#2e3347] rounded-xl p-5 flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7280]">Total cobrado</span>
            <span className="font-semibold">{fmt(totalFinalCents)}</span>
          </div>
          {propinaCents > 0 && (
            <div className="flex justify-between text-sm text-[#eab308] font-semibold">
              <span>Propina registrada</span>
              <span>{fmt(propinaCents)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7280]">Método</span>
            <span className="capitalize font-semibold">{metodo}</span>
          </div>
          {metodo === 'efectivo' && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[#6b7280]">Entregado</span>
                <span>{fmt(entregadoCents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6b7280]">Cambio devuelto</span>
                <span>{fmt(cambio)}</span>
              </div>
            </>
          )}
          <div className="h-px bg-[#2e3347]" />
          <div className="flex justify-between text-sm">
            <span className="text-[#6b7280]">Hora</span>
            <span>{hora}</span>
          </div>
        </div>

        <div className="flex gap-3 w-full">
          <button
            type="button"
            className="flex-1 py-3 rounded-xl border border-[#2e3347] text-sm font-semibold hover:border-[#e8eaf0] transition-colors"
          >
            Imprimir
          </button>
          <button
            type="button"
            onClick={onNuevaOperacion}
            className="flex-[2] py-3 rounded-xl bg-[#4f72ff] text-white font-bold hover:brightness-110 transition-all"
          >
            Nueva operacion →
          </button>
        </div>
      </div>
    </div>
  );
}
