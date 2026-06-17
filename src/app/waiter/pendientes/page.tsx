'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Table2, UtensilsCrossed, Wine } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { Language } from '@/lib/language-context';

interface PendienteItem {
  idx: number;
  nombre: string;
  cantidad: number;
  precio: number;
  tipo: 'comida' | 'bebida';
}

interface PendientePedido {
  id: string;
  createdAt: string;
  items: PendienteItem[];
}

interface PendienteMesa {
  mesaId: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  pedidos: PendientePedido[];
}

const BG        = 'oklch(13% 0.02 252)';
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

function getMesaLabel(m: PendienteMesa) {
  return m.mesaNombre ?? `Mesa ${m.mesaNumero ?? '—'}`;
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}


interface PedidoItemButtonProps {
  item: PendienteItem;
  isRetained: boolean;
  lang: Language;
  onToggle: () => void;
}

function PedidoItemButton({ item, isRetained, lang, onToggle }: PedidoItemButtonProps) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
      style={{
        background: isRetained ? 'oklch(21% 0.10 65)' : 'oklch(15% 0.04 148)',
        border: `1px solid ${isRetained ? 'oklch(50% 0.22 65 / 0.55)' : 'oklch(40% 0.14 148 / 0.4)'}`,
      }}
      onClick={onToggle}>
      <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
        style={{
          background: isRetained ? 'transparent' : 'oklch(50% 0.22 148)',
          border: `2px solid ${isRetained ? 'oklch(55% 0.04 252)' : 'oklch(50% 0.22 148)'}`,
        }}>
        {!isRetained && <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>✓</span>}
      </div>
      <span className="flex-1 text-xs" style={{ color: isRetained ? 'oklch(65% 0.14 65)' : TEXT_MAIN }}>
        {item.cantidad}× {item.nombre}
      </span>
      {item.tipo === 'comida'
        ? <UtensilsCrossed className="w-3 h-3 shrink-0" style={{ color: isRetained ? 'oklch(65% 0.14 65)' : 'oklch(62% 0.14 62)' }} />
        : <Wine className="w-3 h-3 shrink-0" style={{ color: isRetained ? 'oklch(65% 0.14 65)' : 'oklch(62% 0.14 252)' }} />
      }
      {isRetained && (
        <span className="text-[10px] shrink-0 font-medium" style={{ color: 'oklch(72% 0.18 65)' }}>
          {t('kitchenItemRetenido', lang)}
        </span>
      )}
    </button>
  );
}

export default function WaiterPendientesPage() {
  const { language: lang } = useLanguage();
  const [mesas, setMesas] = useState<PendienteMesa[]>([]);
  const [retainMap, setRetainMap] = useState<Record<string, Set<number>>>({});
  const [confirming, setConfirming] = useState<Set<string>>(new Set());

  const fetchPendientes = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/pendientes/orders');
      if (r.ok) {
        const json = await r.json() as { mesas: PendienteMesa[] };
        setMesas(json.mesas ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchPendientes();
    const poll = setInterval(fetchPendientes, 3000);
    return () => clearInterval(poll);
  }, [fetchPendientes]);

  useEffect(() => {
    const tick = setInterval(() => setMesas(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  const toggleRetain = useCallback((pedidoId: string, idx: number) => {
    setRetainMap(prev => {
      const set = new Set(prev[pedidoId] ?? []);
      if (set.has(idx)) set.delete(idx); else set.add(idx);
      return { ...prev, [pedidoId]: set };
    });
  }, []);

  const toggleAllRetain = useCallback((pedidoId: string, items: PendienteItem[]) => {
    setRetainMap(prev => {
      const current = prev[pedidoId] ?? new Set<number>();
      const allRetained = items.every(i => current.has(i.idx));
      if (allRetained) {
        const n = { ...prev };
        delete n[pedidoId];
        return n;
      }
      return { ...prev, [pedidoId]: new Set(items.map(i => i.idx)) };
    });
  }, []);

  const handleConfirm = useCallback(async (pedidoId: string, sendTipo?: 'comida' | 'bebida') => {
    setConfirming(prev => new Set(prev).add(pedidoId));
    try {
      const manualRetain = Array.from(retainMap[pedidoId] ?? []);
      let retainIndices = manualRetain;
      if (sendTipo) {
        const pedido = mesas.flatMap(m => m.pedidos).find(p => p.id === pedidoId);
        if (pedido) {
          const autoRetain = pedido.items.filter(i => i.tipo !== sendTipo).map(i => i.idx);
          retainIndices = [...new Set([...autoRetain, ...manualRetain])];
        }
      }
      const r = await fetch('/api/waiter/pendientes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId, retainIndices }),
      });
      if (r.ok) {
        const removePedido = (m: PendienteMesa) => ({ ...m, pedidos: m.pedidos.filter(p => p.id !== pedidoId) });
        setMesas(prev => prev.map(removePedido).filter(m => m.pedidos.length > 0));
        setRetainMap(prev => { const n = { ...prev }; delete n[pedidoId]; return n; });
      }
    } finally {
      setConfirming(prev => { const n = new Set(prev); n.delete(pedidoId); return n; });
    }
  }, [retainMap, mesas]);

  const totalItems = mesas.reduce((s, m) => s + m.pedidos.reduce((sp, p) => sp + p.items.length, 0), 0);

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <div className="fixed top-0 left-0 right-0 z-10 shadow-lg"
        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(42% 0.10 252 / 0.35)' }}>
        <div className="flex h-11 items-center gap-3 px-4">
          <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
            <ChevronLeft className="w-4 h-4" />
            {t('waiterLogout', lang)}
          </a>
          <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
            {t('pendientesTitle', lang)}
          </span>
          <span className="text-[10px]" style={{ color: TEXT_DIM }}>({totalItems})</span>
        </div>
      </div>

      <div className="pt-[44px] px-3 pb-6">
        {mesas.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('pendientesEmpty', lang)}
          </div>
        )}

        <div className="flex flex-col gap-4 pt-3">
          {mesas.map(mesa => (
            <div key={mesa.mesaId}>
              <div className="flex items-center gap-2 px-1 mb-2">
                <Table2 className="w-3.5 h-3.5" style={{ color: 'oklch(62% 0.14 62)' }} />
                <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{getMesaLabel(mesa)}</span>
              </div>

              <div className="flex flex-col gap-3">
                {mesa.pedidos.map(pedido => {
                  const retained = retainMap[pedido.id] ?? new Set<number>();
                  const isConfirming = confirming.has(pedido.id);
                  const elapsed = getElapsedMinutes(pedido.createdAt);
                  const allRetained = pedido.items.every(i => retained.has(i.idx));

                  const cocinaItems = pedido.items.filter(i => i.tipo === 'comida');
                  const barItems = pedido.items.filter(i => i.tipo === 'bebida');
                  const sendCocinaCount = cocinaItems.filter(i => !retained.has(i.idx)).length;
                  const sendBarCount = barItems.filter(i => !retained.has(i.idx)).length;

                  return (
                    <div key={pedido.id} className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}>
                      <div className="flex items-center gap-2 px-3 py-2"
                        style={{ background: 'oklch(18% 0.03 252)', borderBottom: '1px solid oklch(35% 0.08 252 / 0.4)' }}>
                        <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                        <button
                          className="ml-auto text-[10px] px-2 py-0.5 rounded font-medium"
                          style={{
                            background: allRetained ? 'oklch(21% 0.10 65)' : 'oklch(20% 0.05 252)',
                            color: allRetained ? 'oklch(72% 0.18 65)' : TEXT_DIM,
                            border: `1px solid ${allRetained ? 'oklch(50% 0.22 65 / 0.4)' : 'oklch(38% 0.06 252 / 0.5)'}`,
                          }}
                          onClick={() => toggleAllRetain(pedido.id, pedido.items)}>
                          {allRetained ? t('pendientesSeleccionarTodos', lang) : t('pendientesDeseleccionarTodos', lang)}
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5 p-2">
                        {pedido.items.map(item => (
                          <PedidoItemButton
                            key={item.idx}
                            item={item}
                            isRetained={retained.has(item.idx)}
                            lang={lang}
                            onToggle={() => toggleRetain(pedido.id, item.idx)}
                          />
                        ))}
                      </div>

                      <div className="px-2 pb-2 flex gap-2" style={{ borderTop: '1px solid oklch(35% 0.08 252 / 0.4)', paddingTop: '0.5rem' }}>
                        {cocinaItems.length > 0 && (
                          <button
                            className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                            disabled={isConfirming}
                            style={{
                              background: sendCocinaCount > 0 ? 'oklch(22% 0.14 148)' : 'oklch(21% 0.10 65)',
                              color: sendCocinaCount > 0 ? 'oklch(74% 0.20 148)' : 'oklch(72% 0.18 65)',
                              border: `1px solid ${sendCocinaCount > 0 ? 'oklch(46% 0.22 148 / 0.6)' : 'oklch(50% 0.22 65 / 0.5)'}`,
                              opacity: isConfirming ? 0.6 : 1,
                            }}
                            onClick={() => { void handleConfirm(pedido.id, 'comida'); }}>
                            <UtensilsCrossed className="w-3 h-3 shrink-0" />
                            {isConfirming ? '...' : sendCocinaCount > 0 ? t('pendientesConfirmar', lang).replace('{n}', String(sendCocinaCount)) : t('pendientesRetenerTodos', lang)}
                          </button>
                        )}
                        {barItems.length > 0 && (
                          <button
                            className="flex-1 rounded-lg py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                            disabled={isConfirming}
                            style={{
                              background: sendBarCount > 0 ? 'oklch(20% 0.10 252)' : 'oklch(21% 0.10 65)',
                              color: sendBarCount > 0 ? 'oklch(70% 0.16 252)' : 'oklch(72% 0.18 65)',
                              border: `1px solid ${sendBarCount > 0 ? 'oklch(45% 0.18 252 / 0.6)' : 'oklch(50% 0.22 65 / 0.5)'}`,
                              opacity: isConfirming ? 0.6 : 1,
                            }}
                            onClick={() => { void handleConfirm(pedido.id, 'bebida'); }}>
                            <Wine className="w-3 h-3 shrink-0" />
                            {isConfirming ? '...' : sendBarCount > 0 ? t('pendientesConfirmarBar', lang).replace('{n}', String(sendBarCount)) : t('pendientesRetenerTodos', lang)}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
