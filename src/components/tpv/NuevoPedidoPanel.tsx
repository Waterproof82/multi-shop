'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote } from 'lucide-react';
import type { PendingItem } from '@/hooks/tpv/useMesaActiva';
import { getCsrfToken } from '@/lib/csrf-client';

interface Props {
  readonly sesionId: string | null;
  readonly mesaId: string;
  readonly mesaNumero: number | null;
  readonly mesaName: string | null;
  readonly pendingItems: PendingItem[];
  readonly pendingTotal: number;
  readonly onPendingSent: () => void;
  readonly onRemovePending: (nombre: string, complementos: { nombre: string; precio: number }[]) => void;
  readonly onUpdatePendingNota: (productId: string, complementos: { nombre: string; precio: number }[], nota: string | undefined) => void;
}

function fmt(euros: number): string {
  return euros.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const PASE_BUTTON_LABEL: Record<'primer' | 'segundo' | 'postre', string> = {
  primer: 'I · 1er pase',
  segundo: 'II · 2º pase',
  postre: '🍮 Postre',
};

export function NuevoPedidoPanel({
  sesionId, mesaId, mesaNumero, mesaName,
  pendingItems, pendingTotal,
  onPendingSent, onRemovePending, onUpdatePendingNota,
}: Readonly<Props>) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pendingPase, setPendingPase] = useState<'primer' | 'segundo' | 'postre' | ''>('');
  const [directoACocina, setDirectoACocina] = useState(false);
  const [pendingNota, setPendingNota] = useState('');
  const [notaExpandida, setNotaExpandida] = useState<string | null>(null);
  return (
    <aside className="w-[300px] shrink-0 bg-[#f8fafc] border-l border-[#e2e8f0] flex flex-col">
      <div className="px-4 py-3.5 border-b border-[#e2e8f0] flex items-center justify-between bg-white">
        <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">Nuevo pedido</span>
        {pendingItems.length > 0 && (
          <span className="text-xs font-bold text-[#2563eb] bg-[#eff6ff] rounded-full px-2 py-0.5">
            {pendingItems.reduce((s, i) => s + i.cantidad, 0)} ítem{pendingItems.reduce((s, i) => s + i.cantidad, 0) !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {pendingItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <span className="text-3xl">🍽</span>
            <p className="text-sm text-[#94a3b8]">Seleccioná platos del menú para añadirlos aquí</p>
          </div>
        ) : (
          <div className="py-2">
            {pendingItems.map((item) => {
              const itemKey = item.productId + item.complementos.map(c => c.nombre).join(',');
              const notaOpen = notaExpandida === itemKey;
              return (
                <div key={itemKey} className="border-b border-[#e2e8f0] last:border-b-0 bg-white">
                  <div className="flex items-center gap-2 px-3 py-2 min-h-[52px]">
                    <span className="w-7 h-7 rounded-md bg-[#2563eb] text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {item.cantidad}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#0f172a] leading-snug line-clamp-2">{item.nombre}</p>
                      {item.complementos.length > 0 && (
                        <p className="text-[10px] text-[#64748b] line-clamp-1">{item.complementos.map(c => c.nombre).join(', ')}</p>
                      )}
                      {item.nota && !notaOpen && (
                        <p className="text-[10px] italic text-[#a78bfa] line-clamp-1">✎ {item.nota}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setNotaExpandida(prev => prev === itemKey ? null : itemKey)}
                      className={`w-11 h-11 flex items-center justify-center rounded-lg shrink-0 transition-colors ${notaOpen || item.nota ? 'text-[#a78bfa] bg-[#f5f3ff]' : 'text-[#94a3b8] hover:text-[#a78bfa] hover:bg-[#f5f3ff]'}`}
                      aria-label="Nota del ítem"
                    >
                      <StickyNote className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemovePending(item.nombre, item.complementos)}
                      className="w-11 h-11 flex items-center justify-center rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50 shrink-0 transition-colors text-xl"
                      aria-label={`Eliminar ${item.nombre}`}
                    >
                      ×
                    </button>
                  </div>
                  {notaOpen && (
                    <div className="px-3 pb-3">
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={item.nota ?? ''}
                        onChange={e => onUpdatePendingNota(item.productId, item.complementos, e.target.value || undefined)}
                        placeholder="Nota para este ítem..."
                        className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2 text-xs text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#a78bfa] transition-colors resize-none"
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

      <div className="border-t border-[#e2e8f0] p-4 flex flex-col gap-3 bg-white">
        {sendError && (
          <p className="text-xs text-red-600 text-center">{sendError}</p>
        )}
        {pendingItems.length > 0 && (
          <>
            <div className="flex gap-1 flex-wrap">
              {(['primer', 'segundo', 'postre'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setPendingPase(prev => prev === p ? '' : p); setDirectoACocina(false); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    pendingPase === p && !directoACocina
                      ? 'bg-[#2563eb] border-[#2563eb] text-white'
                      : 'border-[#e2e8f0] text-[#475569] hover:border-[#2563eb] hover:text-[#1e40af]'
                  }`}
                >
                  {PASE_BUTTON_LABEL[p]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setDirectoACocina(prev => !prev); setPendingPase(''); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  directoACocina
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : 'border-[#e2e8f0] text-[#475569] hover:border-amber-600 hover:text-amber-700'
                }`}
              >
                ⚡ Directo
              </button>
            </div>

            <textarea
              rows={2}
              maxLength={500}
              value={pendingNota}
              onChange={e => setPendingNota(e.target.value)}
              placeholder="Nota del pedido (opcional)..."
              className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-3 py-2 text-xs text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:border-[#2563eb] transition-colors resize-none"
            />

            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <span>Total pedido</span>
              <span>{fmt(pendingTotal)}</span>
            </div>

            <button
              type="button"
              disabled={sending}
              className="w-full bg-[#2563eb] text-white rounded-xl py-3 text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              onClick={async () => {
                setSendError(null);

                const csrfToken = getCsrfToken();
                const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                if (csrfToken) headers['x-csrf-token'] = csrfToken;
                const body = JSON.stringify({
                  mesaId,
                  items: pendingItems.map(i => ({
                    productId: i.productId,
                    nombre: i.nombre,
                    precio: i.precioTotal,
                    cantidad: i.cantidad,
                    complementos: i.complementos.map(c => c.nombre),
                    ...(i.nota ? { nota: i.nota } : {}),
                  })),
                  nota: pendingNota || undefined,
                  pase: (!directoACocina && pendingPase) ? pendingPase : undefined,
                  directoACocina,
                });

                // Mesa ya tiene sesión → optimistic: limpia ya y envía en background
                if (sesionId) {
                  onPendingSent();
                  setPendingNota('');
                  setPendingPase('');
                  setDirectoACocina(false);
                  void fetch('/api/tpv/pedidos', { method: 'POST', headers, body })
                    .then(async res => {
                      if (!res.ok) {
                        const err = await res.json() as { error?: string };
                        setSendError(err.error ?? 'Error al enviar el pedido');
                      }
                    })
                    .catch(() => setSendError('Error de conexión'));
                  return;
                }

                // Primer pedido: necesitamos el sesionId del server para la URL
                setSending(true);
                try {
                  const res = await fetch('/api/tpv/pedidos', { method: 'POST', headers, body });
                  if (!res.ok) {
                    const err = await res.json() as { error?: string };
                    setSendError(err.error ?? 'Error al enviar el pedido');
                  } else {
                    const json = await res.json() as { sesionId?: string | null };
                    onPendingSent();
                    setPendingNota('');
                    setPendingPase('');
                    setDirectoACocina(false);
                    const params = new URLSearchParams({ mesaId, mesaNumero: String(mesaNumero ?? ''), sesionId: json.sesionId ?? '' });
                    if (mesaName) params.set('mesaName', mesaName);
                    router.replace(`/tpv/mostrador?${params.toString()}`);
                  }
                } catch {
                  setSendError('Error de conexión');
                } finally {
                  setSending(false);
                }
              }}
            >
              {sending ? 'Enviando...' : '📤 Enviar a cocina'}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
