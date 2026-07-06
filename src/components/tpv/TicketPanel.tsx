'use client';

import { useRef, useState } from 'react';
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
  readonly yaCobradoCents: number;
  readonly turnoId: string;
  readonly tipoImpuesto: 'iva' | 'igic';
  readonly porcentajeImpuesto: number;
  readonly sesionPagada: boolean;
  readonly onRemovePending: (nombre: string, complementos: string[]) => void;
  readonly onUpdatePendingNota: (productId: string, complementos: string[], nota: string | undefined) => void;
  readonly onPendingSent: () => void;
}

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
  pendiente: '#ef4444',
  en_preparacion: '#f97316',
  preparado: '#22c55e',
  servido: '#22c55e',
  retenido: '#f97316',
  pendiente_validacion: '#a78bfa',
};

export function TicketPanel({
  sesionId, mesaId, mesaNumero, mesaName, existingOrders, pendingItems,
  existingTotal, pendingTotal, yaCobradoCents, turnoId, tipoImpuesto, porcentajeImpuesto,
  sesionPagada, onRemovePending, onUpdatePendingNota, onPendingSent,
}: Readonly<Props>) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingPase, setPendingPase] = useState<'primer' | 'segundo' | 'postre' | 'bebida' | ''>('');
  const [notaExpandida, setNotaExpandida] = useState<string | null>(null); // pedido id expandido
  const [pendingNotaExpandida, setPendingNotaExpandida] = useState<string | null>(null); // pending item key expandido
  const [notasLocal, setNotasLocal] = useState<Record<string, string>>({});
  const [pendingNota, setPendingNota] = useState('');
  const notaSaveRef = useRef<NodeJS.Timeout | null>(null);
  const total = existingTotal + pendingTotal;
  const impuestoRate = porcentajeImpuesto / 100;
  const subtotal = total / (1 + impuestoRate);
  const iva = total - subtotal;
  const hasContent = existingOrders.length > 0 || pendingItems.length > 0;
  const canCobrar = sesionId !== null;
  const pendienteEuros = Math.max(0, existingTotal - yaCobradoCents / 100);
  const hasPendingOrders = existingOrders.some(
    o => ['pendiente_validacion', 'pendiente', 'en_preparacion', 'preparado', 'retenido'].includes(o.estado)
  );

  const mesaLabel = mesaNumero !== null
    ? `Mesa ${mesaNumero}${mesaName ? ` · ${mesaName}` : ''}`
    : null;

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
            Selecciona una mesa para ver el ticket
          </p>
        )}

        {/* Existing orders from DB */}
        {existingOrders.map(order => (
          <div key={order.id} className="border-b border-[#2e3347]/50 last:border-b-0">
            <button
              type="button"
              onClick={() => setNotaExpandida(prev => prev === order.id ? null : order.id)}
              className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#22263a]/40 transition-colors"
            >
              <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider">
                Pedido #{order.numeroPedido}
                {getNota(order) && <span className="ml-1.5 text-[#4f72ff]">✎</span>}
                {order.pase && (
                  <span className="ml-2 text-[#4f72ff]">
                    {order.pase === 'primer' ? '1er' : order.pase === 'segundo' ? '2º' : order.pase === 'postre' ? 'Postre' : 'Bebida'}
                  </span>
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
            {notaExpandida === order.id && (
              <div className="px-4 pb-3">
                <textarea
                  rows={2}
                  maxLength={500}
                  value={getNota(order)}
                  onChange={e => handleNotaChange(order.id, e.target.value)}
                  placeholder="Añadir nota al pedido..."
                  className="w-full bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs text-[#e8eaf0] placeholder:text-[#4b5563] focus:outline-none focus:border-[#4f72ff] transition-colors resize-none"
                />
              </div>
            )}
          </div>
        ))}

        {/* Pending items (draft, not yet sent) */}
        {pendingItems.length > 0 && (
          <div className="border-t border-[#4f72ff]/30">
            <div className="px-4 py-1.5">
              <span className="text-[10px] font-bold text-[#4f72ff] uppercase tracking-wider">Nuevo pedido</span>
            </div>
            {pendingItems.map((item) => {
              const itemKey = item.productId + item.complementos.join(',');
              const notaOpen = pendingNotaExpandida === itemKey;
              return (
                <div key={itemKey} className="border-b border-[#2e3347]/30 last:border-b-0">
                  <div className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-[#22263a] transition-colors">
                    <span className="w-6 h-6 rounded-md bg-[#4f72ff] text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {item.cantidad}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.nombre}</p>
                      {item.complementos.length > 0 && (
                        <p className="text-[10px] text-[#6b7280] truncate">{item.complementos.join(', ')}</p>
                      )}
                      {item.nota && !notaOpen && (
                        <p className="text-[10px] italic text-[#a78bfa] truncate">✎ {item.nota}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold shrink-0">{fmt(item.precio * item.cantidad)}</span>
                    <button
                      type="button"
                      onClick={() => setPendingNotaExpandida(prev => prev === itemKey ? null : itemKey)}
                      className={`text-xs leading-none shrink-0 mt-0.5 px-1 transition-colors ${notaOpen || item.nota ? 'text-[#a78bfa]' : 'text-[#6b7280] hover:text-[#a78bfa]'}`}
                      aria-label="Nota del ítem"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePending(item.nombre, item.complementos)}
                      className="text-[#6b7280] hover:text-red-400 text-base leading-none shrink-0 mt-0.5"
                      aria-label={`Eliminar ${item.nombre}`}
                    >
                      ×
                    </button>
                  </div>
                  {notaOpen && (
                    <div className="px-4 pb-3">
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={item.nota ?? ''}
                        onChange={e => onUpdatePendingNota(item.productId, item.complementos, e.target.value || undefined)}
                        placeholder="Nota para este ítem..."
                        className="w-full bg-[#0f1117] border border-[#2e3347] rounded-lg px-3 py-2 text-xs text-[#e8eaf0] placeholder:text-[#4b5563] focus:outline-none focus:border-[#a78bfa] transition-colors resize-none"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
              <span>{tipoImpuesto.toUpperCase()} ({porcentajeImpuesto}%)</span><span>{fmt(iva)}</span>
            </div>
            <div className="text-2xl font-bold mt-1">{fmt(total)}</div>
          </>
        )}
        {sendError && (
          <p className="text-xs text-red-400 text-center">{sendError}</p>
        )}
        {pendingItems.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {(['primer', 'segundo', 'postre', 'bebida'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPendingPase(prev => prev === p ? '' : p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  pendingPase === p
                    ? 'bg-[#4f72ff] border-[#4f72ff] text-white'
                    : 'border-[#2e3347] text-[#6b7280] hover:text-white hover:border-[#4f72ff]'
                }`}
              >
                {p === 'primer' ? '1er pase' : p === 'segundo' ? '2º pase' : p === 'postre' ? 'Postre' : 'Bebida'}
              </button>
            ))}
          </div>
        )}
        {pendingItems.length > 0 && (
          <textarea
            rows={2}
            maxLength={500}
            value={pendingNota}
            onChange={e => setPendingNota(e.target.value)}
            placeholder="Nota del pedido (opcional)..."
            className="w-full bg-[#0f1117] border border-[#2e3347] rounded-xl px-3 py-2 text-xs text-[#e8eaf0] placeholder:text-[#4b5563] focus:outline-none focus:border-[#4f72ff] transition-colors resize-none"
          />
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
                      ...(i.nota ? { nota: i.nota } : {}),
                    })),
                    nota: pendingNota || undefined,
                    pase: pendingPase || undefined,
                  }),
                });
                if (!res.ok) {
                  const err = await res.json() as { error?: string };
                  setSendError(err.error ?? 'Error al enviar el pedido');
                } else {
                  const json = await res.json() as { sesionId?: string | null };
                  onPendingSent();
                  setPendingNota('');
                  setPendingPase('');
                  // If the mesa had no session yet, navigate to include the new sesionId in the URL
                  if (!sesionId && json.sesionId && mesaId) {
                    const params = new URLSearchParams({ mesaId, mesaNumero: String(mesaNumero ?? ''), sesionId: json.sesionId });
                    if (mesaName) params.set('mesaName', mesaName);
                    router.replace(`/tpv/mostrador?${params.toString()}`);
                  } else {
                    router.refresh();
                  }
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
        {hasPendingOrders && canCobrar && !sesionPagada && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#f9731615] border border-[#f9731640]">
            <span className="text-sm leading-none mt-0.5">🍽</span>
            <p className="text-xs leading-snug text-[#f97316]">
              Quedan pedidos sin servir. Servilos antes de cobrar.
            </p>
          </div>
        )}
        {sesionPagada && (
          <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-[#22c55e15] border border-[#22c55e40]">
            <span className="text-sm leading-none mt-0.5">✓</span>
            <p className="text-xs leading-snug text-[#22c55e]">
              Mesa cobrada por el camarero.
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={!canCobrar || hasPendingOrders || sesionPagada}
          onClick={() => router.push(`/tpv/cobro/${sesionId}?turnoId=${turnoId}`)}
          className="w-full bg-[#22c55e] text-white rounded-xl py-3.5 text-base font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
        >
          Cobrar {pendienteEuros > 0 ? fmt(pendienteEuros) : ''}
        </button>
      </div>
    </aside>
  );
}
