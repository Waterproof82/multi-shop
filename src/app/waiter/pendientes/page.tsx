'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Table2, UtensilsCrossed, Wine, Pause, CheckCheck } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

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
  /** true = pedido ya validado, los ítems mostrados son retenidos a liberar */
  validated?: boolean;
}

interface PendienteMesa {
  mesaId: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  pedidos: PendientePedido[];
}

// Item fusionado de todos los pedidos de una mesa.
// globalKey = `${pedidoId}:${idx}` — identifica unívocamente cada ítem.
interface MergedItem extends PendienteItem {
  pedidoId: string;
  globalKey: string;
}

const BG        = 'oklch(13% 0.02 252)';
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getMergedItems(mesa: PendienteMesa): MergedItem[] {
  return mesa.pedidos
    .flatMap(p => p.items.map(i => ({ ...i, pedidoId: p.id, globalKey: `${p.id}:${i.idx}` })))
    .sort((a, b) => {
      if (a.tipo === b.tipo) return 0;
      return a.tipo === 'comida' ? -1 : 1; // comida primero, bebida después
    });
}

function getOldestCreatedAt(mesa: PendienteMesa): string {
  return mesa.pedidos.reduce((oldest, p) =>
    new Date(p.createdAt) < new Date(oldest) ? p.createdAt : oldest,
    mesa.pedidos[0].createdAt
  );
}

interface PedidoItemButtonProps {
  item: MergedItem;
  isSelected: boolean;
  isPaused: boolean;
  onToggleSelect: () => void;
  onTogglePause: () => void;
}

function PedidoItemButton({ item, isSelected, isPaused, onToggleSelect, onTogglePause }: PedidoItemButtonProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer"
      style={{
        background: 'oklch(15% 0.03 252)',
        border: '1px solid oklch(35% 0.06 252 / 0.5)',
      }}
      onClick={onToggleSelect}
    >
      {/* Checkbox de selección */}
      <button
        onClick={e => e.stopPropagation()}
        className="shrink-0 flex items-center justify-center rounded"
        style={{
          width: 20, height: 20,
          background: isSelected ? 'oklch(50% 0.22 148)' : 'transparent',
          border: `2px solid ${isSelected ? 'oklch(50% 0.22 148)' : 'oklch(45% 0.06 252)'}`,
        }}>
        {isSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
      </button>
      <span className="flex-1 text-xs" style={{ color: TEXT_MAIN }}>
        {item.cantidad}× {item.nombre}
      </span>
      {item.tipo === 'comida'
        ? <UtensilsCrossed className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
        : <Wine className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.14 252)' }} />
      }
      {/* Botón de pausa: solo para comida (cocina) */}
      {item.tipo === 'comida' && (
        <button
          onClick={e => { e.stopPropagation(); onTogglePause(); }}
          className="shrink-0 flex items-center justify-center rounded"
          style={{
            width: 28, height: 28,
            background: isPaused ? 'oklch(28% 0.14 65)' : 'oklch(20% 0.04 252)',
            color: isPaused ? 'oklch(78% 0.20 65)' : 'oklch(42% 0.06 252)',
            border: `1px solid ${isPaused ? 'oklch(50% 0.22 65 / 0.6)' : 'oklch(35% 0.06 252 / 0.4)'}`,
          }}>
          <Pause className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default function WaiterPendientesPage() {
  const { language: lang } = useLanguage();
  const [mesas, setMesas] = useState<PendienteMesa[]>([]);
  // selectedMap: ítems marcados con ✓ (se incluirán en la confirmación selectiva)
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  // pausedMap: ítems con pausa activa (se confirmarán como retenidos)
  const [pausedMap, setPausedMap] = useState<Record<string, Set<string>>>({});
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

  // ── Selección (checkboxes) ────────────────────────────────────────────────

  const toggleSelect = useCallback((mesaId: string, globalKey: string) => {
    setSelectedMap(prev => {
      const set = new Set(prev[mesaId] ?? []);
      if (set.has(globalKey)) set.delete(globalKey); else set.add(globalKey);
      return { ...prev, [mesaId]: set };
    });
  }, []);

  const toggleAllSelect = useCallback((mesaId: string, items: MergedItem[]) => {
    setSelectedMap(prev => {
      const current = prev[mesaId] ?? new Set<string>();
      const allSelected = items.every(i => current.has(i.globalKey));
      if (allSelected) {
        const n = { ...prev };
        delete n[mesaId];
        return n;
      }
      return { ...prev, [mesaId]: new Set(items.map(i => i.globalKey)) };
    });
  }, []);

  const toggleTypeSelect = useCallback((mesaId: string, items: MergedItem[], tipo: 'comida' | 'bebida', select: boolean) => {
    setSelectedMap(prev => {
      const current = new Set(prev[mesaId] ?? []);
      const typeItems = items.filter(i => i.tipo === tipo);
      if (select) {
        for (const i of typeItems) current.add(i.globalKey);
      } else {
        for (const i of typeItems) current.delete(i.globalKey);
      }
      if (current.size === 0) {
        const n = { ...prev };
        delete n[mesaId];
        return n;
      }
      return { ...prev, [mesaId]: current };
    });
  }, []);

  // ── Pausa (retenido al confirmar) ─────────────────────────────────────────

  const togglePause = useCallback((mesaId: string, globalKey: string) => {
    setPausedMap(prev => {
      const set = new Set(prev[mesaId] ?? []);
      if (set.has(globalKey)) set.delete(globalKey); else set.add(globalKey);
      return { ...prev, [mesaId]: set };
    });
  }, []);

  // Confirma/libera ítems de la mesa.
  // mode='all'      → envía todos los ítems del tipo (ignora selección)
  // mode='selected' → envía solo los ítems seleccionados (✓) del tipo
  // En ambos casos: paused → retenido, no-paused → pendiente/normal.
  const handleConfirm = useCallback(async (mesaId: string, sendTipo: 'comida' | 'bebida', mode: 'all' | 'selected' = 'all') => {
    setConfirming(prev => new Set(prev).add(mesaId));
    try {
      const mesa = mesas.find(m => m.mesaId === mesaId);
      if (!mesa) return;
      const paused   = pausedMap[mesaId]   ?? new Set<string>();
      const selected = selectedMap[mesaId] ?? new Set<string>();

      const removedItemsMap = new Map<string, number[]>();

      for (const pedido of mesa.pedidos) {
        if (!pedido.items.some(i => i.tipo === sendTipo)) continue;

        if (pedido.validated) {
          // Liberar ítems no pausados del tipo solicitado (y del modo seleccionado)
          const toRelease = pedido.items.filter(i => {
            if (i.tipo !== sendTipo) return false;
            if (paused.has(`${pedido.id}:${i.idx}`)) return false;
            if (mode === 'selected' && !selected.has(`${pedido.id}:${i.idx}`)) return false;
            return true;
          });
          if (toRelease.length === 0) continue;

          const releasedIdx: number[] = [];
          for (const item of toRelease) {
            const r = await fetch(`/api/waiter/kitchen/items/${pedido.id}/${item.idx}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ estado: 'pendiente' }),
            });
            if (r.ok) releasedIdx.push(item.idx);
          }
          if (releasedIdx.length > 0) removedItemsMap.set(pedido.id, releasedIdx);
        } else {
          // Calcular retainIndices:
          // - ítems del otro tipo (auto-retain)
          // - ítems pausados del tipo solicitado (van como retenido)
          // - ítems NO seleccionados del tipo (cuando mode='selected', quedan retenidos para después)
          // autoRetain: wrong tipo + not selected → from_validation=true (reappear in pendientes)
          const autoRetain = pedido.items.filter(i => i.tipo !== sendTipo).map(i => i.idx);
          const notSelectedOfTipo = mode === 'selected'
            ? pedido.items.filter(i => i.tipo === sendTipo && !selected.has(`${pedido.id}:${i.idx}`)).map(i => i.idx)
            : [];
          const retainIndices = [...new Set([...autoRetain, ...notSelectedOfTipo])];
          // pausedIndices: intentionally paused → from_validation=false (kitchen/bar retenidos only)
          const pausedIndices = pedido.items
            .filter(i => i.tipo === sendTipo && paused.has(`${pedido.id}:${i.idx}`))
            .map(i => i.idx);

          const r = await fetch('/api/waiter/pendientes/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidoId: pedido.id, retainIndices, pausedIndices }),
          });
          if (r.ok) {
            removedItemsMap.set(pedido.id, pedido.items.map(i => i.idx));
          }
        }
      }

      if (removedItemsMap.size === 0) return;

      setMesas(prev => prev
        .map(m => {
          if (m.mesaId !== mesaId) return m;
          return {
            ...m,
            pedidos: m.pedidos
              .map(p => {
                const removed = removedItemsMap.get(p.id);
                if (!removed) return p;
                return { ...p, items: p.items.filter(i => !removed.includes(i.idx)) };
              })
              .filter(p => p.items.length > 0),
          };
        })
        .filter(m => m.pedidos.length > 0)
      );

      const cleanupMap = (prev: Record<string, Set<string>>) => {
        if (!prev[mesaId]) return prev;
        const processedIds = [...removedItemsMap.keys()];
        const remaining = new Set([...prev[mesaId]].filter(k => !processedIds.includes(k.split(':')[0]!)));
        if (remaining.size === 0) { const n = { ...prev }; delete n[mesaId]; return n; }
        return { ...prev, [mesaId]: remaining };
      };
      setPausedMap(cleanupMap);
      setSelectedMap(cleanupMap);
    } finally {
      setConfirming(prev => { const n = new Set(prev); n.delete(mesaId); return n; });
      // Force-sync with server to avoid stale local state showing duplicates
      void fetchPendientes();
    }
  }, [pausedMap, selectedMap, mesas, fetchPendientes]);

  // Confirma TODOS los ítems (comida + bebida) de una sola vez.
  // Solo disponible cuando todos los ítems de la mesa están seleccionados.
  const handleConfirmBoth = useCallback(async (mesaId: string) => {
    setConfirming(prev => new Set(prev).add(mesaId));
    try {
      const mesa = mesas.find(m => m.mesaId === mesaId);
      if (!mesa) return;
      const paused   = pausedMap[mesaId]   ?? new Set<string>();
      const selected = selectedMap[mesaId] ?? new Set<string>();

      const removedItemsMap = new Map<string, number[]>();

      for (const pedido of mesa.pedidos) {
        if (pedido.validated) {
          // Liberar todos los ítems seleccionados y no pausados (cualquier tipo)
          const toRelease = pedido.items.filter(i =>
            selected.has(`${pedido.id}:${i.idx}`) && !paused.has(`${pedido.id}:${i.idx}`)
          );
          if (toRelease.length === 0) continue;

          const releasedIdx: number[] = [];
          for (const item of toRelease) {
            const r = await fetch(`/api/waiter/kitchen/items/${pedido.id}/${item.idx}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ estado: 'pendiente' }),
            });
            if (r.ok) releasedIdx.push(item.idx);
          }
          if (releasedIdx.length > 0) removedItemsMap.set(pedido.id, releasedIdx);
        } else {
          // Sin autoRetain porque se confirman ambos tipos a la vez.
          // Solo quedan retenidos los ítems no seleccionados (si los hubiera).
          const notSelected = pedido.items
            .filter(i => !selected.has(`${pedido.id}:${i.idx}`))
            .map(i => i.idx);
          // pausedIndices: solo comida pausada → kitchen retenido (from_validation=false)
          const pausedIndices = pedido.items
            .filter(i => i.tipo === 'comida' && paused.has(`${pedido.id}:${i.idx}`))
            .map(i => i.idx);

          const r = await fetch('/api/waiter/pendientes/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidoId: pedido.id, retainIndices: notSelected, pausedIndices }),
          });
          if (r.ok) {
            removedItemsMap.set(pedido.id, pedido.items.map(i => i.idx));
          }
        }
      }

      if (removedItemsMap.size === 0) return;

      setMesas(prev => prev
        .map(m => {
          if (m.mesaId !== mesaId) return m;
          return {
            ...m,
            pedidos: m.pedidos
              .map(p => {
                const removed = removedItemsMap.get(p.id);
                if (!removed) return p;
                return { ...p, items: p.items.filter(i => !removed.includes(i.idx)) };
              })
              .filter(p => p.items.length > 0),
          };
        })
        .filter(m => m.pedidos.length > 0)
      );

      const cleanupMap = (prev: Record<string, Set<string>>) => {
        if (!prev[mesaId]) return prev;
        const processedIds = [...removedItemsMap.keys()];
        const remaining = new Set([...prev[mesaId]].filter(k => !processedIds.includes(k.split(':')[0]!)));
        if (remaining.size === 0) { const n = { ...prev }; delete n[mesaId]; return n; }
        return { ...prev, [mesaId]: remaining };
      };
      setPausedMap(cleanupMap);
      setSelectedMap(cleanupMap);
    } finally {
      setConfirming(prev => { const n = new Set(prev); n.delete(mesaId); return n; });
      void fetchPendientes();
    }
  }, [pausedMap, selectedMap, mesas, fetchPendientes]);

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
          {mesas.map(mesa => {
            const mergedItems  = getMergedItems(mesa);
            const selected     = selectedMap[mesa.mesaId] ?? new Set<string>();
            const paused       = pausedMap[mesa.mesaId]   ?? new Set<string>();
            const isConfirming = confirming.has(mesa.mesaId);
            const elapsed      = getElapsedMinutes(getOldestCreatedAt(mesa));
            const allSelected  = mergedItems.every(i => selected.has(i.globalKey));
            const cocinaItems  = mergedItems.filter(i => i.tipo === 'comida');
            const barItems     = mergedItems.filter(i => i.tipo === 'bebida');
            const hasSelCocina = cocinaItems.some(i => selected.has(i.globalKey));
            const hasSelBar    = barItems.some(i => selected.has(i.globalKey));
            const displayLabel = mesa.mesaNombre ?? String(mesa.mesaNumero ?? '—');

            return (
              <div key={mesa.mesaId}>
                <div className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}>
                  {/* Mesa header */}
                  <div className="flex items-center gap-2 px-3 py-2.5"
                    style={{ background: 'oklch(18% 0.03 252)', borderBottom: '1px solid oklch(35% 0.08 252 / 0.25)' }}>
                    <Table2 className="w-4 h-4 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
                    <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{displayLabel}</span>
                    <div className="flex items-center gap-2 ml-auto">
                      {allSelected && cocinaItems.length > 0 && barItems.length > 0 && (
                        <button
                          onClick={() => void handleConfirmBoth(mesa.mesaId)}
                          disabled={isConfirming}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          style={{ background: 'oklch(20% 0.12 300)', color: 'oklch(78% 0.18 300)', border: '1px solid oklch(52% 0.22 300 / 0.6)' }}>
                          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                          <UtensilsCrossed className="w-3 h-3 shrink-0" />
                          <Wine className="w-3 h-3 shrink-0" />
                        </button>
                      )}
                      {hasSelCocina && (
                        <button
                          onClick={() => void handleConfirm(mesa.mesaId, 'comida', 'selected')}
                          disabled={isConfirming}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          style={{ background: 'oklch(22% 0.14 148)', color: 'oklch(74% 0.20 148)', border: '1px solid oklch(46% 0.22 148 / 0.6)' }}>
                          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                          <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                      {hasSelBar && (
                        <button
                          onClick={() => void handleConfirm(mesa.mesaId, 'bebida', 'selected')}
                          disabled={isConfirming}
                          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          style={{ background: 'oklch(20% 0.10 252)', color: 'oklch(70% 0.16 252)', border: '1px solid oklch(45% 0.18 252 / 0.6)' }}>
                          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                          <Wine className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Fila 1: timer + seleccionar/deseleccionar todos */}
                  <div className="flex items-center gap-2 px-3 py-2"
                    style={{ background: 'oklch(18% 0.03 252)', borderBottom: '1px solid oklch(35% 0.08 252 / 0.25)' }}>
                    <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                    <button
                      className="ml-auto text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{
                        background: allSelected ? 'oklch(26% 0.12 148)' : 'oklch(20% 0.05 252)',
                        color: allSelected ? 'oklch(74% 0.20 148)' : TEXT_DIM,
                        border: `1px solid ${allSelected ? 'oklch(46% 0.18 148 / 0.5)' : 'oklch(38% 0.06 252 / 0.5)'}`,
                      }}
                      onClick={() => toggleAllSelect(mesa.mesaId, mergedItems)}>
                      {allSelected ? t('pendientesDeseleccionarTodos', lang) : t('pendientesSeleccionarTodos', lang)}
                    </button>
                  </div>
                  {/* Fila 2: selección por tipo (visible cuando hay al menos un tipo) */}
                  {(cocinaItems.length > 0 || barItems.length > 0) && (() => {
                    const allCocina = cocinaItems.length > 0 && cocinaItems.every(i => selected.has(i.globalKey));
                    const allBar    = barItems.length > 0 && barItems.every(i => selected.has(i.globalKey));
                    return (
                      <div className="flex items-center gap-2 px-3 py-1.5"
                        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(35% 0.08 252 / 0.4)' }}>
                        {cocinaItems.length > 0 && (
                          <button
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium"
                            style={{
                              background: allCocina ? 'oklch(26% 0.12 148)' : 'oklch(20% 0.05 252)',
                              color: allCocina ? 'oklch(74% 0.20 148)' : 'oklch(62% 0.14 62)',
                              border: `1px solid ${allCocina ? 'oklch(46% 0.18 148 / 0.5)' : 'oklch(38% 0.06 252 / 0.5)'}`,
                            }}
                            onClick={() => toggleTypeSelect(mesa.mesaId, mergedItems, 'comida', !allCocina)}>
                            <UtensilsCrossed className="w-2.5 h-2.5" />
                            {allCocina ? t('pendientesDeseleccionarTodos', lang) : t('pendientesSeleccionarTodos', lang)}
                          </button>
                        )}
                        {barItems.length > 0 && (
                          <button
                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium"
                            style={{
                              background: allBar ? 'oklch(22% 0.10 252)' : 'oklch(20% 0.05 252)',
                              color: 'oklch(62% 0.14 252)',
                              border: `1px solid ${allBar ? 'oklch(45% 0.18 252 / 0.5)' : 'oklch(38% 0.06 252 / 0.5)'}`,
                            }}
                            onClick={() => toggleTypeSelect(mesa.mesaId, mergedItems, 'bebida', !allBar)}>
                            <Wine className="w-2.5 h-2.5" />
                            {allBar ? t('pendientesDeseleccionarTodos', lang) : t('pendientesSeleccionarTodos', lang)}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex flex-col gap-1.5 p-2">
                    {mergedItems.map(item => (
                      <PedidoItemButton
                        key={item.globalKey}
                        item={item}
                        isSelected={selected.has(item.globalKey)}
                        isPaused={paused.has(item.globalKey)}
                        onToggleSelect={() => toggleSelect(mesa.mesaId, item.globalKey)}
                        onTogglePause={() => togglePause(mesa.mesaId, item.globalKey)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
