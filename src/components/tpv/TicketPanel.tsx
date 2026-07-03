'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExistingOrder } from './MostradorClient';
import type { PendingItem } from '@/hooks/tpv/useMesaActiva';
import { getCsrfToken } from '@/lib/csrf-client';

interface Props {
  readonly sesionId: string | null;
  readonly mesaId: string | null;
  readonly mesaNumero: number | null;
  readonly mesaName: string | null;
  readonly existingOrders: ExistingOrder[];
  readonly pendingItems: PendingItem[];
  readonly existingTotal: number;
  readonly pendingTotal: number;
  readonly turnoId: string;
  readonly onRemovePending: (nombre: string, complementos: string[]) => void;
  readonly onPendingSent: () => void;
}

const IVA_RATE = 0.1;

function fmt(euros: number): string {
  return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const ESTADO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  en_preparacion: 'En cocina',
  preparado: 'Listo',
  servido: 'Servido',
  retenido: 'Retenido',
  pendiente_validacion: 'Validando',
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente: '#6b7280',
  en_preparacion: '#f59e0b',
  preparado: '#22c55e',
  servido: '#6b7280',
  retenido: '#f97316',
  pendiente_validacion: '#a78bfa',
};

export function TicketPanel({
  sesionId, mesaId, mesaNumero, mesaName, existingOrders, pendingItems,
  existingTotal, pendingTotal, turnoId, onRemovePending, onPendingSent,
}: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const total = existingTotal + pendingTotal;
  const subtotal = total / (1 + IVA_RATE);
  const iva = total - subtotal;
  const hasContent = existingOrders.length > 0 || pendingItems.length > 0;
  const canCobrar = sesionId !== null;

  const mesaLabel = mesaNumero !== null
    ? `Mesa ${mesaNumero}${mesaName ? ` · ${mesaName}` : ''}`
    : null;

  return (
    <aside className="w-[300px] shrink-0 bg-[#1a1d27] border-r border-[#2e3347] flex flex-col">
      <div className="px-4 py-3.5 border-b border-[#2e3347] flex justify-between items-center">
        <span className="text-xs font-bold text-[#6b7280] uppercase tracking-wider">Ticket activo</span>
        {mesaLabel && (
          <span className="text-xs text-[#4f72ff] font-semibold">{mesaLabel}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {!hasContent && (
          <p className="px-4 py-8 text-center text-sm text-[#6b7280]">
            Seleccioná una mesa para ver el ticket
          </p>
        )}

        {/* Existing orders from DB */}
        {existingOrders.map(order => (
          <div key={order.id} className="border-b border-[#2e3347]/50 last:border-b-0">
            <div className="flex items-center justify-between px-4 py-1.5">
              <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">
                Pedido #{order.numeroPedido}
              </span>
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: ESTADO_COLOR[order.estado] ?? '#6b7280', background: (ESTADO_COLOR[order.estado] ?? '#6b7280') + '22' }}
              >
                {ESTADO_LABEL[order.estado] ?? order.estado}
              </span>
            </div>
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 px-4 py-2 hover:bg-[#22263a]/50 transition-colors">
                <span className="w-5 h-5 rounded bg-[#22263a] text-[#6b7280] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {item.cantidad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-[#c8cad4]">{item.nombre}</p>
                  {item.complementos.length > 0 && (
                    <p className="text-[10px] text-[#6b7280] truncate">{item.complementos.join(', ')}</p>
                  )}
                </div>
                <span className="text-sm font-semibold shrink-0 text-[#c8cad4]">
                  {fmt(item.precio * item.cantidad)}
                </span>
              </div>
            ))}
          </div>
        ))}

        {/* Pending items (draft, not yet sent) */}
        {pendingItems.length > 0 && (
          <div className="border-t border-[#4f72ff]/30">
            <div className="px-4 py-1.5">
              <span className="text-[10px] font-bold text-[#4f72ff] uppercase tracking-wider">Nuevo pedido</span>
            </div>
            {pendingItems.map((item) => (
              <div
                key={item.nombre + item.complementos.join(',')}
                className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#22263a] transition-colors"
              >
                <span className="w-6 h-6 rounded-md bg-[#4f72ff] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {item.cantidad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.nombre}</p>
                  {item.complementos.length > 0 && (
                    <p className="text-[10px] text-[#6b7280] truncate">{item.complementos.join(', ')}</p>
                  )}
                </div>
                <span className="text-sm font-semibold shrink-0">{fmt(item.precio * item.cantidad)}</span>
                <button
                  type="button"
                  onClick={() => onRemovePending(item.nombre, item.complementos)}
                  className="text-[#6b7280] hover:text-red-400 text-base leading-none shrink-0 mt-0.5"
                  aria-label={`Eliminar ${item.nombre}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[#2e3347] p-4 flex flex-col gap-3">
        {hasContent && (
          <>
            <div className="flex justify-between text-sm text-[#6b7280]">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm text-[#6b7280]">
              <span>IVA (10%)</span><span>{fmt(iva)}</span>
            </div>
            <div className="text-2xl font-bold mt-1">{fmt(total)}</div>
          </>
        )}
        {sendError && (
          <p className="text-xs text-red-400 text-center">{sendError}</p>
        )}
        {pendingItems.length > 0 && (
          <button
            type="button"
            disabled={sending || !mesaId}
            className="w-full bg-[#4f72ff] text-white rounded-xl py-3 text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50"
            onClick={async () => {
              if (!mesaId) return;
              setSending(true);
              setSendError(null);
              try {
                const csrfToken = getCsrfToken();
                const res = await fetch('/api/tpv/pedidos', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
                  },
                  body: JSON.stringify({
                    mesaId,
                    items: pendingItems.map(i => ({
                      productId: i.productId,
                      nombre: i.nombre,
                      precio: i.precio,
                      cantidad: i.cantidad,
                      complementos: i.complementos,
                    })),
                  }),
                });
                if (!res.ok) {
                  const err = await res.json() as { error?: string };
                  setSendError(err.error ?? 'Error al enviar el pedido');
                } else {
                  onPendingSent();
                  router.refresh();
                }
              } catch {
                setSendError('Error de conexión');
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? 'Enviando...' : `Enviar a cocina (${fmt(pendingTotal)})`}
          </button>
        )}
        <button
          type="button"
          disabled={!canCobrar}
          onClick={() => router.push(`/tpv/cobro/${sesionId}?turnoId=${turnoId}`)}
          className="w-full bg-[#22c55e] text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          Cobrar {existingTotal > 0 ? fmt(existingTotal) : ''}
        </button>
      </div>
    </aside>
  );
}
