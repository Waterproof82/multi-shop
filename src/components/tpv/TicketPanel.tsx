'use client';

import { useRouter } from 'next/navigation';
import type { PedidoItem } from '@/core/domain/entities/types';

type TicketItem = Pick<PedidoItem, 'nombre' | 'precio' | 'cantidad'>;

interface Props {
  readonly sesionId: string | null;
  readonly mesaNumero: number | null;
  readonly items: TicketItem[];
  readonly total: number;
  readonly turnoId: string;
  readonly onRemove: (nombre: string) => void;
}

const IVA_RATE = 0.1;

function fmt(euros: number): string {
  return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export function TicketPanel({ sesionId, mesaNumero, items, total, turnoId, onRemove }: Props) {
  const router = useRouter();
  const subtotal = total / (1 + IVA_RATE);
  const iva = total - subtotal;
  const canCobrar = sesionId !== null && items.length > 0;

  return (
    <aside className="w-[300px] shrink-0 bg-[#1a1d27] border-r border-[#2e3347] flex flex-col">
      <div className="px-4 py-3.5 border-b border-[#2e3347] flex justify-between items-center">
        <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Ticket activo</span>
        {mesaNumero !== null && (
          <span className="text-xs text-[#6b7280]">Mesa {mesaNumero}</span>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto py-2">
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-[#6b7280]">
            Seleccioná una mesa y añadí productos
          </li>
        )}
        {items.map(item => (
          <li
            key={item.nombre}
            className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#22263a] transition-colors"
          >
            <span className="w-6 h-6 rounded-md bg-[#4f72ff] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {item.cantidad}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.nombre}</p>
            </div>
            <span className="text-sm font-semibold shrink-0">{fmt(item.precio * item.cantidad)}</span>
            <button
              type="button"
              onClick={() => onRemove(item.nombre)}
              className="text-[#6b7280] hover:text-red-400 text-base leading-none shrink-0 mt-0.5"
              aria-label={`Eliminar ${item.nombre}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-[#2e3347] p-4 flex flex-col gap-3">
        <div className="flex justify-between text-sm text-[#6b7280]">
          <span>Subtotal</span><span>{fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-[#6b7280]">
          <span>IVA (10%)</span><span>{fmt(iva)}</span>
        </div>
        <div className="text-2xl font-bold mt-1">{fmt(total)}</div>
        <button
          type="button"
          disabled={!canCobrar}
          onClick={() => router.push(`/tpv/cobro/${sesionId}?turnoId=${turnoId}`)}
          className="w-full bg-[#22c55e] text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          Cobrar
        </button>
      </div>
    </aside>
  );
}
