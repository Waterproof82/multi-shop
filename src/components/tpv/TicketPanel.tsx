'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote } from 'lucide-react';
import type { ExistingOrder } from './MostradorClient';
import { getCsrfToken } from '@/lib/csrf-client';

interface Props {
  readonly sesionId: string | null;
  readonly mesaId: string | null;
  readonly mesaNumero: number | null;
  readonly mesaName: string | null;
  readonly existingOrders: ExistingOrder[];
  readonly existingTotal: number;
  readonly yaCobradoCents: number;
  readonly turnoId: string;
  readonly tipoImpuesto: 'iva' | 'igic';
  readonly porcentajeImpuesto: number;
  readonly sesionPagada: boolean;
}

function fmt(euros: number): string {
  return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function paseShortLabel(p?: string): string {
  if (p === 'primer') return '1er';
  if (p === 'segundo') return '2º';
  return 'Postre';
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: '🔴 Pendiente',
  en_preparacion: '🍳 En cocina',
  preparado: '✓ Listo',
  servido: '✓ Servido',
  retenido: '⏸ Retenido',
  pendiente_validacion: '⏳ Validando',
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#ef4444',
  en_preparacion: '#f97316',
  preparado: '#22c55e',
  servido: '#22c55e',
  retenido: '#f97316',
  pendiente_validacion: '#a78bfa',
};

export function TicketPanel({
  sesionId, mesaId, mesaNumero, mesaName, existingOrders,
  existingTotal, yaCobradoCents, turnoId, tipoImpuesto, porcentajeImpuesto,
  sesionPagada,
}: Readonly<Props>) {
  const router = useRouter();
  const [notaExpandida, setNotaExpandida] = useState<string | null>(null);
  const [notasLocal, setNotasLocal] = useState<Record<string, string>>({});
  const notaSaveRef = useRef<NodeJS.Timeout | null>(null);

  const impuestoRate = porcentajeImpuesto / 100;
  const subtotal = existingTotal / (1 + impuestoRate);
  const iva = existingTotal - subtotal;
  const canCobrar = sesionId !== null;
  const pendienteEuros = Math.max(0, existingTotal - yaCobradoCents / 100);
  const hasPendingOrders = existingOrders.some(
    o => ['pendiente_validacion', 'pendiente', 'en_preparacion', 'preparado', 'retenido'].includes(o.estado)
  );

  const mesaNamePart = mesaName ? ` · ${mesaName}` : '';
  const mesaLabel = mesaNumero !== null ? `Mesa ${mesaNumero}${mesaNamePart}` : null;

  function saveNota(pedidoId: string, nota: string) {
    if (notaSaveRef.current) clearTimeout(notaSaveRef.current);
    notaSaveRef.current = setTimeout(() => {
      const csrfToken = getCsrfToken();
      void fetch(`/api/tpv/pedidos/${pedidoId}/nota`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify({ nota: nota || null }),
      });
    }, 600);
  }

  function handleNotaChange(pedidoId: string, value: string) {
    setNotasLocal(prev => ({ ...prev, [pedidoId]: value }));
    saveNota(pedidoId, value);
  }

  function getNota(order: ExistingOrder): string {
    return notasLocal[order.id] ?? order.nota ?? '';
  }

  return (
    <aside className="w-[260px] shrink-0 bg-white border-r border-[#e2e8f0] flex flex-col">
      <div className="px-4 py-3.5 border-b border-[#e2e8f0] flex justify-between items-center">
        <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Ticket activo</span>
        {mesaLabel && (
          <span className="text-xs text-[#2563eb] font-semibold">{mesaLabel}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {existingOrders.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-[#94a3b8]">
            {mesaId ? 'Sin pedidos enviados aún' : 'Seleccioná una mesa para ver el ticket'}
          </p>
        )}

        {existingOrders.map(order => (
          <div key={order.id} className="border-b border-[#e2e8f0] last:border-b-0">
            <button
              type="button"
              onClick={() => setNotaExpandida(prev => prev === order.id ? null : order.id)}
              className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#f8fafc] transition-colors"
            >
              <span className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                Pedido #{order.numeroPedido}
                {getNota(order) && <span className="ml-1.5 text-[#2563eb]">✎</span>}
                {order.pase && (
                  <span className="ml-2 text-[#2563eb]">{paseShortLabel(order.pase)}</span>
                )}
              </span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: ESTADO_COLOR[order.estado] ?? '#6b7280', background: (ESTADO_COLOR[order.estado] ?? '#6b7280') + '22' }}
              >
                {ESTADO_LABEL[order.estado] ?? order.estado}
              </span>
            </button>
            {order.items.map((item, idx) => (
              <div key={`${order.id}-${idx}`} className="flex items-start gap-2.5 px-4 py-2 hover:bg-[#f8fafc] transition-colors">
                <span className="w-5 h-5 rounded bg-[#f1f5f9] text-[#475569] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {item.cantidad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-[#0f172a]">{item.nombre}</p>
                  {item.complementos.length > 0 && (
                    <p className="text-[10px] text-[#64748b] truncate">{item.complementos.join(', ')}</p>
                  )}
                </div>
                <span className="text-sm font-semibold shrink-0 text-[#0f172a]">
                  {fmt(item.precio * item.cantidad)}
                </span>
              </div>
            ))}
            {notaExpandida === order.id && (
              <div className="px-4 pb-3">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={getNota(order)}
                  onChange={e => handleNotaChange(order.id, e.target.value)}
                  placeholder="Añadir nota al pedido..."
                  className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2 text-xs text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb] transition-colors resize-none"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-[#e2e8f0] p-4 flex flex-col gap-3">
        {existingOrders.length > 0 && (
          <>
            <div className="flex justify-between text-sm text-[#64748b]">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#64748b]">
              <span>{tipoImpuesto.toUpperCase()} ({porcentajeImpuesto}%)</span><span>{fmt(iva)}</span>
            </div>
            <div className="text-2xl font-bold mt-1 text-[#0f172a]">{fmt(existingTotal)}</div>
          </>
        )}
        {hasPendingOrders && canCobrar && !sesionPagada && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#fff7ed] border border-[#fed7aa]">
            <span className="text-sm leading-none mt-0.5">🍽</span>
            <p className="text-xs leading-snug text-[#ea580c]">
              Quedan pedidos sin servir. Servilos antes de cobrar.
            </p>
          </div>
        )}
        {sesionPagada && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#f0fdf4] border border-[#bbf7d0]">
            <span className="text-sm leading-none mt-0.5">✓</span>
            <p className="text-xs leading-snug text-[#16a34a]">
              Mesa cobrada por el camarero.
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={!canCobrar || hasPendingOrders || sesionPagada}
          onClick={() => router.push(`/tpv/cobro/${sesionId}?turnoId=${turnoId}`)}
          className="w-full bg-[#16a34a] text-white rounded-xl py-4 text-lg font-extrabold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all flex items-center justify-center gap-2"
        >
          💳 COBRAR {pendienteEuros > 0 ? fmt(pendienteEuros) : ''}
        </button>
      </div>
    </aside>
  );
}
