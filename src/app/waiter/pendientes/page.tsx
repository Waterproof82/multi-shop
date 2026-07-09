'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronDown, Table2, UtensilsCrossed, Wine, Pause, CheckCheck, Trash2, Layers } from 'lucide-react';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface PendienteItem {
  idx: number;
  nombre: string;
  cantidad: number;
  precio: number;
  tipo: 'comida' | 'bebida';
  complementos?: string;
  nota?: string;
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
  mesaId: string;
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
    .flatMap(p => p.items.map(i => ({ ...i, pedidoId: p.id, globalKey: `${p.id}:${i.idx}`, mesaId: mesa.mesaId })))
    .sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'comida' ? -1 : 1;
      return a.nombre.localeCompare(b.nombre);
    });
}


interface GroupedPendienteItem {
  groupKey: string;
  nombre: string;
  complementos?: string;
  nota?: string;
  tipo: 'comida' | 'bebida';
  totalCantidad: number;
  items: MergedItem[];
}

function getGroupedItems(mergedItems: MergedItem[], paused: Set<string>): GroupedPendienteItem[] {
  const map = new Map<string, GroupedPendienteItem>();
  for (const item of mergedItems) {
    // Include paused state in key: paused and non-paused items stay separate
    const isPaused = paused.has(item.globalKey);
    const key = `${item.tipo}|${item.nombre}|${item.complementos ?? ''}|${item.nota ?? ''}|${isPaused ? '1' : '0'}`;
    if (!map.has(key)) {
      map.set(key, { groupKey: key, nombre: item.nombre, complementos: item.complementos, nota: item.nota, tipo: item.tipo, totalCantidad: 0, items: [] });
    }
    const g = map.get(key)!;
    g.totalCantidad += item.cantidad;
    g.items.push(item);
  }
  return Array.from(map.values());
}

async function releaseRetainedPedidoItems(
  pedidoId: string,
  items: PendienteItem[],
  sendTipo: 'comida' | 'bebida',
  selected: Set<string>,
  paused: Set<string>,
  mode: 'all' | 'selected'
): Promise<number[]> {
  const toRelease = items.filter(i => {
    if (i.tipo !== sendTipo) return false;
    const isSelected = selected.has(`${pedidoId}:${i.idx}`);
    if (mode === 'selected' && !isSelected) return false;
    if (paused.has(`${pedidoId}:${i.idx}`) && !isSelected) return false;
    return true;
  });
  const releasedIdx: number[] = [];
  for (const item of toRelease) {
    const r = await fetch(`/api/waiter/kitchen/items/${pedidoId}/${item.idx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'pendiente' }),
    });
    if (r.ok) releasedIdx.push(item.idx);
  }
  return releasedIdx;
}

async function validateNewPedido(
  pedidoId: string,
  items: PendienteItem[],
  sendTipo: 'comida' | 'bebida',
  selected: Set<string>,
  paused: Set<string>,
  mode: 'all' | 'selected'
): Promise<boolean> {
  const autoRetain = items.filter(i => i.tipo !== sendTipo).map(i => i.idx);
  const notSelectedOfTipo = mode === 'selected'
    ? items.filter(i => i.tipo === sendTipo && !selected.has(`${pedidoId}:${i.idx}`)).map(i => i.idx)
    : [];
  const retainIndices = [...new Set([...autoRetain, ...notSelectedOfTipo])];
  const pausedIndices = items
    .filter(i => i.tipo === sendTipo && paused.has(`${pedidoId}:${i.idx}`))
    .map(i => i.idx);
  const r = await fetch('/api/waiter/pendientes/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedidoId, retainIndices, pausedIndices }),
  });
  return r.ok;
}

async function releaseSelectedPedidoItems(
  pedidoId: string,
  items: PendienteItem[],
  selected: Set<string>
): Promise<number[]> {
  const toRelease = items.filter(i => selected.has(`${pedidoId}:${i.idx}`));
  if (toRelease.length === 0) return [];
  const releasedIdx: number[] = [];
  for (const item of toRelease) {
    const r = await fetch(`/api/waiter/kitchen/items/${pedidoId}/${item.idx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'pendiente' }),
    });
    if (r.ok) releasedIdx.push(item.idx);
  }
  return releasedIdx;
}

async function validateBothTypesPedido(
  pedidoId: string,
  items: PendienteItem[],
  selected: Set<string>,
  paused: Set<string>
): Promise<boolean> {
  const notSelected = items.filter(i => !selected.has(`${pedidoId}:${i.idx}`)).map(i => i.idx);
  const pausedIndices = items
    .filter(i => i.tipo === 'comida' && paused.has(`${pedidoId}:${i.idx}`))
    .map(i => i.idx);
  const r = await fetch('/api/waiter/pendientes/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pedidoId, retainIndices: notSelected, pausedIndices }),
  });
  return r.ok;
}

function removePedidoItems(
  mesas: PendienteMesa[],
  mesaId: string,
  removedItemsMap: Map<string, number[]>
): PendienteMesa[] {
  return mesas
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
    .filter(m => m.pedidos.length > 0);
}

function toggleSetItems(
  prev: Record<string, Set<string>>,
  mesaId: string,
  keys: string[],
  allActive: boolean
): Record<string, Set<string>> {
  const current = new Set(prev[mesaId] ?? []);
  if (allActive) { keys.forEach(k => current.delete(k)); }
  else { keys.forEach(k => current.add(k)); }
  if (current.size === 0) { const n = { ...prev }; delete n[mesaId]; return n; }
  return { ...prev, [mesaId]: current };
}

function makeCleanupMap(mesaId: string, removedItemsMap: Map<string, number[]>) {
  return (prev: Record<string, Set<string>>) => {
    if (!prev[mesaId]) return prev;
    const processedIds = new Set(removedItemsMap.keys());
    const remaining = new Set([...prev[mesaId]].filter(k => !processedIds.has(k.split(':')[0] ?? '')));
    if (remaining.size === 0) { const n = { ...prev }; delete n[mesaId]; return n; }
    return { ...prev, [mesaId]: remaining };
  };
}

function getOldestCreatedAt(mesa: PendienteMesa): string {
  return mesa.pedidos.reduce((oldest, p) =>
    new Date(p.createdAt) < new Date(oldest) ? p.createdAt : oldest,
    mesa.pedidos[0].createdAt
  );
}

interface PedidoItemButtonProps {
  readonly item: MergedItem;
  readonly isSelected: boolean;
  readonly isPaused: boolean;
  readonly onToggleSelect: () => void;
  readonly onTogglePause: () => void;
}

function PedidoItemButton({ item, isSelected, isPaused, onToggleSelect, onTogglePause }: PedidoItemButtonProps) {
  return (
    <div
      className="flex items-center rounded-lg overflow-hidden"
      style={{ background: 'oklch(15% 0.03 252)', border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-2 px-3 py-3 text-left"
        onClick={onToggleSelect}
      >
        <span
          className="shrink-0 flex items-center justify-center rounded"
          style={{
            width: 20, height: 20,
            background: isSelected ? 'oklch(50% 0.22 148)' : 'transparent',
            border: `2px solid ${isSelected ? 'oklch(50% 0.22 148)' : 'oklch(45% 0.06 252)'}`,
          }}
        >
          {isSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-xs" style={{ color: TEXT_MAIN }}>{item.cantidad}× {item.nombre}</span>
          {item.complementos && (
            <div className="text-[10px] truncate" style={{ color: TEXT_DIM }}>({item.complementos})</div>
          )}
          {item.nota && (
            <div className="text-[10px] italic truncate" style={{ color: 'oklch(72% 0.12 85)' }}>✎ {item.nota}</div>
          )}
        </div>
        {item.tipo === 'comida'
          ? <UtensilsCrossed className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
          : <Wine className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.14 252)' }} />
        }
      </button>
      {item.tipo === 'comida' && (
        <button
          type="button"
          onClick={onTogglePause}
          className="shrink-0 flex items-center justify-center rounded"
          style={{
            width: 36, height: 36, margin: '0 4px',
            background: isPaused ? 'oklch(28% 0.14 65)' : 'oklch(20% 0.04 252)',
            color: isPaused ? 'oklch(78% 0.20 65)' : 'oklch(42% 0.06 252)',
            border: `1px solid ${isPaused ? 'oklch(50% 0.22 65 / 0.6)' : 'oklch(35% 0.06 252 / 0.4)'}`,
          }}
        >
          <Pause className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default function WaiterPendientesPage() {
  const { language: lang } = useLanguage();
  // Unique channel name per instance — avoids React StrictMode double-mount
  // returning a stale closed channel on the second mount.
  const channelNameRef = useRef(`waiter-pendientes-${Math.random().toString(36).slice(2)}`);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [waiterEmpresaId, setWaiterEmpresaId] = useState<string | null>(null);
  const [mesas, setMesas] = useState<PendienteMesa[]>([]);
  // selectedMap: ítems marcados con ✓ (se incluirán en la confirmación selectiva)
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  // pausedMap: ítems con pausa activa (se confirmarán como retenidos)
  const [pausedMap, setPausedMap] = useState<Record<string, Set<string>>>({});
  const [confirming, setConfirming] = useState<Set<string>>(new Set());
  // Ref mirror of confirming — used in bannerRelay to avoid premature fetches
  // while the validate loop is still processing multiple pedidos.
  const confirmingRef = useRef<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [groupedMesas, setGroupedMesas] = useState<Set<string>>(new Set());
  const [collapsedMesas, setCollapsedMesas] = useState<Set<string>>(new Set());
  const [mesaFilter, setMesaFilter] = useState('');

  // Visibility lifecycle — disconnect Realtime when tab is hidden, reconnect on visible
  useEffect(() => {
    const onVis = () => setIsTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Fetch empresaId on mount for tenant-scoped Realtime filter
  useEffect(() => {
    fetch('/api/waiter/me')
      .then(r => r.ok ? r.json() : null)
      .then((json: { empresaId: string } | null) => {
        if (json) setWaiterEmpresaId(json.empresaId);
      })
      .catch(() => null);
  }, []);

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
    if (!isTabVisible) return;
    if (!waiterEmpresaId) return;

    void fetchPendientes();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void fetchPendientes(); }, 100);
    };
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${waiterEmpresaId}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados', filter: `empresa_id=eq.${waiterEmpresaId}` }, trigger)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones', filter: `empresa_id=eq.${waiterEmpresaId}` }, trigger)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-pendientes error:', status);
        }
      });

    // Fallback: WaiterBanner relays Realtime events via DOM for cases where
    // the direct postgres_changes subscription doesn't fire (known Supabase JS
    // limitation with multiple channels on the same singleton client subscribing
    // to the same table).
    // Skip relay fires while a confirmation is in progress: the validate loop
    // processes pedidos sequentially and the DB trigger fires after each one,
    // so an intermediate fetch would show stale data mid-loop. The finally
    // block in handleConfirm/handleConfirmBoth does the authoritative refresh.
    const bannerRelay = () => {
      if (confirmingRef.current.size > 0) return;
      void fetchPendientes();
    };
    globalThis.addEventListener('waiter-realtime-update', bannerRelay);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      globalThis.removeEventListener('waiter-realtime-update', bannerRelay);
    };
  }, [fetchPendientes, isTabVisible, waiterEmpresaId]);

  // Re-fetch when tab becomes visible again so stale data is refreshed immediately.
  useEffect(() => {
    if (isTabVisible && waiterEmpresaId && confirmingRef.current.size === 0) {
      void fetchPendientes();
      globalThis.dispatchEvent(new CustomEvent('waiter-realtime-update'));
    }
  }, [isTabVisible, waiterEmpresaId, fetchPendientes]);

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
    confirmingRef.current = new Set(confirmingRef.current).add(mesaId);
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
          const released = await releaseRetainedPedidoItems(pedido.id, pedido.items, sendTipo, selected, paused, mode);
          if (released.length > 0) removedItemsMap.set(pedido.id, released);
        } else {
          const ok = await validateNewPedido(pedido.id, pedido.items, sendTipo, selected, paused, mode);
          if (ok) removedItemsMap.set(pedido.id, pedido.items.map(i => i.idx));
        }
      }

      if (removedItemsMap.size === 0) return;

      setMesas(prev => removePedidoItems(prev, mesaId, removedItemsMap));

      const cleanupMap = makeCleanupMap(mesaId, removedItemsMap);
      setPausedMap(cleanupMap);
      setSelectedMap(cleanupMap);
    } finally {
      confirmingRef.current = new Set([...confirmingRef.current].filter(id => id !== mesaId));
      setConfirming(prev => { const n = new Set(prev); n.delete(mesaId); return n; });
      // Force-sync with server to avoid stale local state showing duplicates
      void fetchPendientes();
    }
  }, [pausedMap, selectedMap, mesas, fetchPendientes]);

  // Confirma TODOS los ítems (comida + bebida) de una sola vez.
  // Solo disponible cuando todos los ítems de la mesa están seleccionados.
  const handleConfirmBoth = useCallback(async (mesaId: string) => {
    confirmingRef.current = new Set(confirmingRef.current).add(mesaId);
    setConfirming(prev => new Set(prev).add(mesaId));
    try {
      const mesa = mesas.find(m => m.mesaId === mesaId);
      if (!mesa) return;
      const paused   = pausedMap[mesaId]   ?? new Set<string>();
      const selected = selectedMap[mesaId] ?? new Set<string>();

      const removedItemsMap = new Map<string, number[]>();

      for (const pedido of mesa.pedidos) {
        if (pedido.validated) {
          const released = await releaseSelectedPedidoItems(pedido.id, pedido.items, selected);
          if (released.length > 0) removedItemsMap.set(pedido.id, released);
        } else {
          const ok = await validateBothTypesPedido(pedido.id, pedido.items, selected, paused);
          if (ok) removedItemsMap.set(pedido.id, pedido.items.map(i => i.idx));
        }
      }

      if (removedItemsMap.size === 0) return;

      setMesas(prev => removePedidoItems(prev, mesaId, removedItemsMap));

      const cleanupMap = makeCleanupMap(mesaId, removedItemsMap);
      setPausedMap(cleanupMap);
      setSelectedMap(cleanupMap);
    } finally {
      confirmingRef.current = new Set([...confirmingRef.current].filter(id => id !== mesaId));
      setConfirming(prev => { const n = new Set(prev); n.delete(mesaId); return n; });
      void fetchPendientes();
    }
  }, [pausedMap, selectedMap, mesas, fetchPendientes]);

  const handleDeleteSelected = useCallback(async (mesaId: string) => {
    setPendingDelete(null);
    setConfirming(prev => new Set(prev).add(mesaId));
    try {
      const mesa = mesas.find(m => m.mesaId === mesaId);
      if (!mesa) return;
      const selected = selectedMap[mesaId] ?? new Set<string>();
      if (selected.size === 0) return;

      const removedItemsMap = new Map<string, number[]>();

      for (const pedido of mesa.pedidos) {
        const toCancel = pedido.items.filter(i => selected.has(`${pedido.id}:${i.idx}`));
        if (toCancel.length === 0) continue;
        const cancelledIdx: number[] = [];
        for (const item of toCancel) {
          const r = await fetch(`/api/waiter/kitchen/items/${encodeURIComponent(pedido.id)}/${item.idx}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'cancelado' }),
          });
          if (r.ok) cancelledIdx.push(item.idx);
        }
        if (cancelledIdx.length > 0) removedItemsMap.set(pedido.id, cancelledIdx);
      }

      if (removedItemsMap.size === 0) return;

      setMesas(prev => removePedidoItems(prev, mesaId, removedItemsMap));

      setSelectedMap(prev => {
        if (!prev[mesaId]) return prev;
        const n = { ...prev };
        delete n[mesaId];
        return n;
      });
    } finally {
      setConfirming(prev => { const n = new Set(prev); n.delete(mesaId); return n; });
      void fetchPendientes();
    }
  }, [mesas, selectedMap, fetchPendientes]);

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
        {/* Search / filter bar */}
        <div className="px-3 py-2" style={{ borderTop: '1px solid oklch(35% 0.08 252 / 0.25)', background: 'oklch(16% 0.025 252)' }}>
          <input
            type="text"
            placeholder="Buscar mesa…"
            value={mesaFilter}
            onChange={e => setMesaFilter(e.target.value)}
            className="w-full rounded-lg px-3 py-1.5 text-xs outline-none"
            style={{
              background: 'oklch(20% 0.04 252)',
              border: '1px solid oklch(38% 0.08 252 / 0.5)',
              color: TEXT_MAIN,
            }}
          />
        </div>
      </div>

      <div className="pt-[88px] px-3 pb-6">
        {mesas.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('pendientesEmpty', lang)}
          </div>
        )}

        <div className="flex flex-col gap-4 pt-3">
          {mesas
            .filter(m => {
              if (!mesaFilter.trim()) return true;
              const label = (m.mesaNombre ?? String(m.mesaNumero ?? '')).toLowerCase();
              return label.includes(mesaFilter.trim().toLowerCase());
            })
            .map(mesa => {
            const mergedItems  = getMergedItems(mesa);
            const selected     = selectedMap[mesa.mesaId] ?? new Set<string>();
            const paused       = pausedMap[mesa.mesaId]   ?? new Set<string>();
            const isConfirming = confirming.has(mesa.mesaId);
            const isGrouped    = groupedMesas.has(mesa.mesaId);
            const isCollapsed  = collapsedMesas.has(mesa.mesaId);
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
                          className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
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
                          className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
                          style={{ background: 'oklch(22% 0.14 148)', color: 'oklch(74% 0.20 148)', border: '1px solid oklch(46% 0.22 148 / 0.6)' }}>
                          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                          <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                      {hasSelBar && (
                        <button
                          onClick={() => void handleConfirm(mesa.mesaId, 'bebida', 'selected')}
                          disabled={isConfirming}
                          className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
                          style={{ background: 'oklch(20% 0.10 252)', color: 'oklch(70% 0.16 252)', border: '1px solid oklch(45% 0.18 252 / 0.6)' }}>
                          <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                          <Wine className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                      <button
                        onClick={() => setGroupedMesas(prev => { const next = new Set(prev); if (next.has(mesa.mesaId)) { next.delete(mesa.mesaId); } else { next.add(mesa.mesaId); } return next; })}
                        title="Agrupar ítems"
                        className="flex items-center justify-center rounded-lg"
                        style={{ width: 40, height: 38, background: isGrouped ? 'oklch(28% 0.16 228)' : 'oklch(20% 0.04 252)', color: isGrouped ? 'oklch(78% 0.20 228)' : TEXT_DIM, border: isGrouped ? '1px solid oklch(50% 0.22 228 / 0.6)' : '1px solid oklch(35% 0.06 252 / 0.5)' }}
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCollapsedMesas(prev => { const next = new Set(prev); if (next.has(mesa.mesaId)) { next.delete(mesa.mesaId); } else { next.add(mesa.mesaId); } return next; })}
                        title={isCollapsed ? 'Expandir' : 'Contraer'}
                        className="flex items-center justify-center rounded-lg"
                        style={{ width: 40, height: 38, background: 'oklch(20% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
                      >
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                      </button>
                      {selected.size > 0 && (
                        <button
                          onClick={() => setPendingDelete(mesa.mesaId)}
                          disabled={isConfirming}
                          className="flex items-center justify-center rounded-lg disabled:opacity-50"
                          style={{ width: 40, height: 38, background: 'oklch(26% 0.26 25)', color: 'oklch(82% 0.26 25)', border: '2px solid oklch(50% 0.30 25 / 0.7)' }}
                          title={t('pendientesDeleteConfirmTitle', lang)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {!isCollapsed && <div>
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
                    {isGrouped ? getGroupedItems(mergedItems, paused).map(group => {
                      const allGroupSelected = group.items.every(i => selected.has(i.globalKey));
                      const anyGroupSelected = group.items.some(i => selected.has(i.globalKey));
                      const allGroupPaused   = group.tipo === 'comida' && group.items.every(i => paused.has(i.globalKey));
                      const anyGroupPaused   = group.tipo === 'comida' && group.items.some(i => paused.has(i.globalKey));
                      const groupKeys = group.items.map(i => i.globalKey);
                      const toggleGroupSelect = () => { setSelectedMap(toggleSetItems(selectedMap, mesa.mesaId, groupKeys, allGroupSelected)); };
                      const toggleGroupPause = () => { setPausedMap(toggleSetItems(pausedMap, mesa.mesaId, groupKeys, allGroupPaused)); };
                      const isPartialSel = anyGroupSelected && !allGroupSelected;
                      let checkboxBg: string;
                      if (allGroupSelected) { checkboxBg = 'oklch(50% 0.22 148)'; }
                      else if (isPartialSel) { checkboxBg = 'oklch(35% 0.16 148)'; }
                      else { checkboxBg = 'transparent'; }
                      return (
                        <div
                          key={group.groupKey}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg"
                          style={{ background: 'oklch(15% 0.03 252)', border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
                        >
                          <button
                            type="button"
                            onClick={toggleGroupSelect}
                            className="flex-1 flex items-center gap-2 min-w-0 text-left"
                          >
                            <span
                              className="shrink-0 flex items-center justify-center rounded"
                              style={{ width: 20, height: 20, background: checkboxBg, border: `2px solid ${allGroupSelected || isPartialSel ? 'oklch(50% 0.22 148)' : 'oklch(45% 0.06 252)'}` }}
                            >
                              {allGroupSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>✓</span>}
                              {isPartialSel && <span style={{ color: '#fff', fontSize: 9, fontWeight: 'bold', lineHeight: 1 }}>–</span>}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="text-xs" style={{ color: TEXT_MAIN }}>
                                {group.totalCantidad}× {group.nombre}
                              </span>
                              {group.complementos && (
                                <span className="block text-[10px] truncate" style={{ color: TEXT_DIM }}>({group.complementos})</span>
                              )}
                              {group.nota && (
                                <span className="block text-[10px] italic truncate" style={{ color: 'oklch(72% 0.12 85)' }}>✎ {group.nota}</span>
                              )}
                            </span>
                            {group.tipo === 'comida'
                              ? <UtensilsCrossed className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
                              : <Wine className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.14 252)' }} />
                            }
                          </button>
                          {group.tipo === 'comida' && (
                            <button
                              type="button"
                              onClick={toggleGroupPause}
                              className="shrink-0 flex items-center justify-center rounded"
                              style={{ width: 36, height: 36, background: anyGroupPaused ? 'oklch(28% 0.14 65)' : 'oklch(20% 0.04 252)', color: anyGroupPaused ? 'oklch(78% 0.20 65)' : 'oklch(42% 0.06 252)', border: `1px solid ${anyGroupPaused ? 'oklch(50% 0.22 65 / 0.6)' : 'oklch(35% 0.06 252 / 0.4)'}` }}
                            >
                              <Pause className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    }) : mergedItems.map(item => (
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
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {pendingDelete && (() => {
        const mesa = mesas.find(m => m.mesaId === pendingDelete);
        const selected = selectedMap[pendingDelete] ?? new Set<string>();
        // Count only keys that actually exist in current data (avoids stale selections)
        const count = mesa ? getMergedItems(mesa).filter(i => selected.has(i.globalKey)).length : 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            <button
              type="button"
              className="absolute inset-0"
              style={{ background: 'oklch(0% 0 0 / 0.75)' }}
              onClick={() => setPendingDelete(null)}
              onKeyDown={e => { if (e.key === 'Escape') { setPendingDelete(null); } }}
              aria-label="Cerrar"
            />
            <dialog
              open
              className="relative w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
              style={{ background: 'oklch(15% 0.06 25)', border: '2px solid oklch(50% 0.30 25 / 0.7)' }}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'oklch(24% 0.24 25)', border: '2px solid oklch(50% 0.32 25 / 0.7)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: 'oklch(82% 0.26 25)' }} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                    {t('pendientesDeleteConfirmTitle', lang)}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'oklch(72% 0.14 62)' }}>
                    {mesa?.mesaNombre ?? String(mesa?.mesaNumero ?? '—')}
                  </span>
                  <span className="text-xs leading-relaxed mt-0.5" style={{ color: TEXT_DIM }}>
                    {t('pendientesDeleteConfirmMsg', lang).replace('{n}', String(count))}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingDelete(null)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold"
                  style={{ background: 'oklch(20% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
                >
                  {t('kitchenCountdownCancel', lang)}
                </button>
                <button
                  onClick={() => void handleDeleteSelected(pendingDelete)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: 'oklch(30% 0.28 25)', color: 'oklch(88% 0.26 25)', border: '2px solid oklch(52% 0.32 25 / 0.7)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('pendientesDeleteConfirmYes', lang)}
                </button>
              </div>
            </dialog>
          </div>
        );
      })()}
    </div>
  );
}
