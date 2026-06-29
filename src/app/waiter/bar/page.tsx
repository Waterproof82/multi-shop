'use client';

/**
 * Bar page — waiter view for serving pending drink orders.
 *
 * ## Serving flow
 * 1. Waiter swipes a drink card left → 5-second countdown starts.
 * 2. Countdown completes → per-item PATCH (`/waiter/kitchen/items/:id/:idx/status`,
 *    estado = `servido`) written to `pedido_item_estados`.
 * 3. Once ALL bebidas in an order are served, order-level PATCH fires:
 *    - pure-bebida order → estado = `servido` (fully done, disappears everywhere)
 *    - mixed order (also has comida) → estado = `anotado` so kitchen items
 *      remain visible for the cook. The bar page filters by pedido.estado = `pendiente`,
 *      so the order drops off the bar list after this PATCH.
 *
 * ## Multi-device sync
 * `pedido_item_estados` is the source of truth. `findBarOrders` already filters
 * out items marked `servido` server-side, so any bar screen that polls sees the
 * same remaining work. localStorage (`bar_served_keys`) is only an optimistic
 * cache that prevents a served item from reappearing between polls.
 *
 * ## Key stability
 * Swipe keys are `${orderId}:${detallePedidoIdx}` where `detallePedidoIdx` is the
 * item's real index in detalle_pedido, NOT the index in the filtered bebida array.
 * This prevents key collisions when items are filtered out server-side (e.g. item
 * at real idx=1 would otherwise shift to idx=0 after its sibling is served).
 *
 * ## Background processing (navigation mid-countdown)
 * `beforeunload` fires per-item PATCHes for any in-flight countdowns using
 * `keepalive: true` so requests survive the page unload. Items are persisted to
 * localStorage so they stay hidden on the next visit. Order-level PATCHes are only
 * sent when all bebidas in the order are covered (pending + already served).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Wine, ChevronLeft, ChevronDown, ChevronsUpDown, Table2, CheckCheck, Trash2, Layers } from 'lucide-react';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';

const STORAGE_KEY = 'bar_served_keys';

function loadServedKeys(): Set<string> {
  try {
    const raw = globalThis.window ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistServedKeys(keys: Set<string>) {
  try {
    if (keys.size === 0) { localStorage.removeItem(STORAGE_KEY); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch { /* ignore */ }
}

function clearServedKeysForOrder(orderId: string) {
  try {
    const existing = loadServedKeys();
    const updated = new Set([...existing].filter(k => !k.startsWith(`${orderId}:`)));
    persistServedKeys(updated);
  } catch { /* ignore */ }
}

const COUNTDOWN_SECONDS = 5;
const COUNTDOWN_COLOR   = { bg: 'oklch(22% 0.16 148)', border: 'oklch(50% 0.26 148 / 0.6)' };
import { useLanguage, type Language } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface BarOrder {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number; detallePedidoIdx: number }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
  tipo: 'bebida';
  hasComida: boolean;
}

interface FlatBarItem {
  key: string;              // `${orderId}:${itemIdx}` — unique swipe key
  orderId: string;
  itemIdx: number;
  detallePedidoIdx: number; // actual index in detalle_pedido (for per-item PATCH)
  totalInOrder: number;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  createdAt: string;
  nombre: string;
  cantidad: number;
  hasComida: boolean;
}

const BG = "oklch(13% 0.02 252)";
const TEXT_MAIN = "oklch(92% 0.02 252)";
const TEXT_DIM = "oklch(55% 0.04 252)";

const TIME_COLORS: { max: number; label: string; bg: string; border: string; text: string }[] = [
  { max: 10,       label: '< 10 min',  bg: 'oklch(18% 0.06 228)', border: 'oklch(50% 0.22 228 / 0.55)', text: 'oklch(72% 0.20 228)' },
  { max: 20,       label: '10 – 20 m', bg: 'oklch(19% 0.09 168)', border: 'oklch(52% 0.26 168 / 0.55)', text: 'oklch(74% 0.24 168)' },
  { max: 30,       label: '20 – 30 m', bg: 'oklch(22% 0.14 100)', border: 'oklch(56% 0.28 100 / 0.55)', text: 'oklch(78% 0.26 100)' },
  { max: 45,       label: '30 – 45 m', bg: 'oklch(24% 0.18 68)',  border: 'oklch(58% 0.30 68  / 0.60)', text: 'oklch(80% 0.28 68)'  },
  { max: 60,       label: '45 – 60 m', bg: 'oklch(24% 0.20 35)',  border: 'oklch(58% 0.33 35  / 0.65)', text: 'oklch(80% 0.30 35)'  },
  { max: Infinity, label: '60+ min',   bg: 'oklch(22% 0.22 16)',  border: 'oklch(56% 0.36 16  / 0.70)', text: 'oklch(78% 0.34 16)'  },
];

const KITCHEN_ALERT_ACCENT = 'oklch(78% 0.20 148)';

function groupByMesa(items: FlatBarItem[]) {
  const map = new Map<string, { mesaNumero: number | null; mesaNombre: string | null; firstCreatedAt: string; items: FlatBarItem[] }>();
  for (const item of items) {
    const key = item.mesaNombre ?? `Mesa ${item.mesaNumero ?? '—'}`;
    if (!map.has(key)) map.set(key, { mesaNumero: item.mesaNumero, mesaNombre: item.mesaNombre, firstCreatedAt: item.createdAt, items: [] });
    const g = map.get(key)!;
    if (item.createdAt < g.firstCreatedAt) g.firstCreatedAt = item.createdAt;
    g.items.push(item);
  }
  return new Map([...map.entries()].sort((a, b) => a[1].firstCreatedAt.localeCompare(b[1].firstCreatedAt)));
}

function groupByOrder(items: FlatBarItem[]) {
  return items.reduce<Map<string, { numeroPedido: number; mesaNumero: number | null; mesaNombre: string | null; createdAt: string; items: FlatBarItem[] }>>(
    (acc, item) => {
      if (!acc.has(item.orderId)) acc.set(item.orderId, { numeroPedido: item.numeroPedido, mesaNumero: item.mesaNumero, mesaNombre: item.mesaNombre, createdAt: item.createdAt, items: [] });
      acc.get(item.orderId)!.items.push(item);
      return acc;
    }, new Map()
  );
}

interface MergedBarItem {
  nombre: string;
  totalCantidad: number;
  items: FlatBarItem[];     // underlying flat items
  createdAt: string;        // earliest createdAt in the group
}

function cancelBarItems(orders: BarOrder[], items: FlatBarItem[]): BarOrder[] {
  return orders.map(o => {
    const cancelledIdxs = items.filter(i => i.orderId === o.id).map(i => i.detallePedidoIdx);
    if (cancelledIdxs.length === 0) return o;
    const newItems = o.items.filter(i => !cancelledIdxs.includes(i.detallePedidoIdx));
    return newItems.length === 0 ? null : { ...o, items: newItems };
  }).filter((o): o is BarOrder => o !== null);
}

function groupMesaItems(items: FlatBarItem[]): MergedBarItem[] {
  const map = new Map<string, MergedBarItem>();
  for (const item of items) {
    const key = item.nombre;
    if (!map.has(key)) {
      map.set(key, { nombre: item.nombre, totalCantidad: 0, items: [], createdAt: item.createdAt });
    }
    const g = map.get(key)!;
    g.totalCantidad += item.cantidad;
    g.items.push(item);
    if (item.createdAt < g.createdAt) g.createdAt = item.createdAt;
  }
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function getMergedGroupMinRemaining(items: FlatBarItem[], countdowns: Record<string, number>): number {
  const active = items.filter(i => i.key in countdowns);
  return Math.min(...active.map(i => countdowns[i.key] ?? 0));
}

function renderMergedCardInner(
  anyCountdown: boolean,
  minRemaining: number,
  merged: MergedBarItem,
  lang: Language,
  cancelCountdown: (key: string) => void,
) {
  if (anyCountdown) {
    return (
      <>
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-base font-bold"
          style={{ background: 'oklch(32% 0.20 148)', color: 'oklch(80% 0.22 148)', border: '2px solid oklch(55% 0.28 148 / 0.7)' }}>
          {minRemaining}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{merged.totalCantidad}× {merged.nombre}</span>
        </div>
        <button className="rounded px-2 py-1 text-[10px] font-bold shrink-0"
          style={{ background: 'oklch(26% 0.08 25)', color: 'oklch(75% 0.18 25)' }}
          onClick={() => merged.items.forEach(i => cancelCountdown(i.key))}>
          {t('kitchenCountdownCancel', lang)}
        </button>
      </>
    );
  }
  return (
    <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
      <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{merged.totalCantidad}×</span>
      <span className="text-xs truncate" style={{ color: TEXT_MAIN }}>{merged.nombre}</span>
      <span className="text-[10px] ml-auto shrink-0 rounded px-1.5 py-0.5" style={{ background: 'oklch(22% 0.06 252 / 0.5)', color: TEXT_DIM }}>
        {merged.items.length} pedido{merged.items.length === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function getTimeColor(minutes: number) {
  for (const c of TIME_COLORS) {
    if (minutes < c.max) return c;
  }
  return TIME_COLORS.at(-1)!;
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const SWIPE_THRESHOLD = 80;

type SwipeSideEls = { hint: HTMLElement | null; cancelBg: HTMLElement | null; cancelHint: HTMLElement | null };

function applyLeftSwipeDrag({ hint, cancelBg, cancelHint }: SwipeSideEls, delta: number) {
  if (hint) hint.style.opacity = delta < -20 ? String(Math.min(1, (-delta - 20) / 40)) : '0';
  if (cancelBg) cancelBg.style.background = 'transparent';
  if (cancelHint) cancelHint.style.opacity = '0';
}

function applyRightSwipeDrag({ hint, cancelBg, cancelHint }: SwipeSideEls, delta: number) {
  if (hint) hint.style.opacity = '0';
  if (cancelBg) cancelBg.style.background = delta > 20 ? 'oklch(32% 0.26 25)' : 'transparent';
  if (cancelHint) cancelHint.style.opacity = delta > 20 ? String(Math.min(1, (delta - 20) / 60)) : '0';
}

function applySwipeDragVisuals(el: HTMLElement, delta: number) {
  const content    = el.querySelector<HTMLElement>('[data-card-content]');
  const hint       = el.querySelector<HTMLElement>('[data-hint]');
  const cancelBg   = el.querySelector<HTMLElement>('[data-cancel-bg]');
  const cancelHint = el.querySelector<HTMLElement>('[data-cancel-hint]');
  if (content) { content.style.transform = `translateX(${delta}px)`; content.style.transition = 'none'; }
  const els: SwipeSideEls = { hint, cancelBg, cancelHint };
  if (delta < 0) { applyLeftSwipeDrag(els, delta); }
  else { applyRightSwipeDrag(els, delta); }
}

export default function BarPage() {
  const { language } = useLanguage();
  const lang = language;
  const [orders, setOrders]         = useState<BarOrder[]>([]);
  const [servedKeys, setServedKeys]  = useState<Set<string>>(loadServedKeys);
  const [countdowns, setCountdowns]  = useState<Record<string, number>>({});
  const [groupBy, setGroupBy]        = useState<'order' | 'mesa'>('order');
  const [collapsed, setCollapsed]    = useState<Set<string>>(new Set());
  const [pendingServeAll, setPendingServeAll] = useState<string | null>(null);
  const [pendingBarCancel, setPendingBarCancel] = useState<FlatBarItem[] | null>(null);
  const [groupedMesas, setGroupedMesas] = useState<Set<string>>(new Set());
  const [channelName] = useState(() => `waiter-bar-${Math.random().toString(36).slice(2)}`);
  const channelNameRef = useRef(channelName);
  const timersRef     = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pointerStartX = useRef<number | null>(null);
  const swipingId     = useRef<string | null>(null);

  // Refs for beforeunload — must be updated synchronously (useEffect is too late if user navigates immediately)
  const ordersRef              = useRef<BarOrder[]>([]);
  const servedKeysRef          = useRef<Set<string>>(new Set());
  // pendingCountdownsRef is updated directly in startCountdown/cancelCountdown — no React batching delay
  const pendingCountdownsRef   = useRef<Map<string, FlatBarItem>>(new Map());
  useEffect(() => { ordersRef.current     = orders;     }, [orders]);
  useEffect(() => { servedKeysRef.current = servedKeys; }, [servedKeys]);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/bar/orders');
      if (r.ok) {
        const json = await r.json() as { orders: BarOrder[] };
        setOrders(json.orders ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchOrders();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchOrders(); }, 100);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchOrders(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-bar-items error:', status);
        }
      });

    // Broadcast channel — receives 'item-update' events from the DB trigger
    // (notify_waiter_items_update) whenever pedido_item_estados rows change.
    // Bypasses the postgres_changes routing issue on the shared singleton client.
    const broadcastChannel = supabase
      .channel('waiter-items-update')
      .on('broadcast', { event: 'item-update' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchOrders(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-items-update broadcast error (bar):', status);
        }
      });

    // Broadcast channel — receives 'new-order' events from notify_waiter_new_order
    // trigger for ALL pedido inserts (including waiter-placed estado='pendiente'/'retenido').
    // Needed because postgres_changes on pedidos is unreliable on the singleton client.
    const newOrderChannel = supabase
      .channel('waiter-new-order-bar')
      .on('broadcast', { event: 'new-order' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchOrders(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-new-order broadcast error (bar):', status);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(broadcastChannel);
      void supabase.removeChannel(newOrderChannel);
    };
  }, [fetchOrders]);

  // Trigger re-render every second so timers update without refetching
  useEffect(() => {
    const tick = setInterval(() => setOrders(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(id => clearInterval(id)); };
  }, []);

  // On navigation: persist in-flight countdowns to localStorage, then fire PATCH only if order is complete.
  useEffect(() => {
    const handleBeforeUnload = () => {
      const pending = pendingCountdownsRef.current;
      const served  = servedKeysRef.current;
      if (pending.size === 0 && served.size === 0) return;

      // Persist any in-flight countdown items so they stay hidden on next visit
      // and fire per-item PATCH for each one
      if (pending.size > 0) {
        const current = loadServedKeys();
        for (const [key, item] of pending.entries()) {
          current.add(key);
          fetch(`/api/waiter/kitchen/items/${encodeURIComponent(item.orderId)}/${item.detallePedidoIdx}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'servido' }),
            keepalive: true,
          }).catch(() => {});
        }
        persistServedKeys(current);
      }

      // Fire PATCH only for orders where ALL items are now covered (pending + already served)
      const byOrder = new Map<string, { count: number; total: number }>();
      for (const item of pending.values()) {
        const e = byOrder.get(item.orderId);
        byOrder.set(item.orderId, { count: (e?.count ?? 0) + 1, total: item.totalInOrder });
      }
      for (const k of served) {
        const oid = k.substring(0, k.lastIndexOf(':'));
        const e = byOrder.get(oid);
        if (e) byOrder.set(oid, { ...e, count: e.count + 1 });
      }

      for (const [orderId, { count, total }] of byOrder) {
        if (count >= total) {
          const order = ordersRef.current.find(o => o.id === orderId);
          const nuevoEstado = order?.hasComida ? 'anotado' : 'servido';
          clearServedKeysForOrder(orderId);
          fetch(`/api/waiter/orders/${encodeURIComponent(orderId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: nuevoEstado }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────

  /** Called once a single-item countdown reaches zero. Fires per-item PATCH
   *  and, if all bebidas in the order are now served, the order-level PATCH.
   *  Uses servedKeysRef directly (not a state-updater form) to keep nesting shallow. */
  const finishServingItem = useCallback((flatItem: FlatBarItem, key: string) => {
    const { orderId, detallePedidoIdx, totalInOrder, hasComida } = flatItem;

    // Add key to served set via ref to avoid nested state-updater
    const next = new Set(servedKeysRef.current);
    next.add(key);
    persistServedKeys(next);
    servedKeysRef.current = next;
    setServedKeys(new Set(next));

    // Per-item PATCH — always fires when a single item countdown completes
    fetch(`/api/waiter/kitchen/items/${encodeURIComponent(orderId)}/${detallePedidoIdx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'servido' }),
    }).catch(() => {});

    const servedCount = [...next].filter(k => k.startsWith(`${orderId}:`)).length;
    if (servedCount < totalInOrder) return;

    // All bebidas served — update order-level estado.
    // Mixed: → 'anotado' (kitchen keeps comida items visible).
    // Pure bebida: → 'servido' (fully done).
    const nuevoEstado = hasComida ? 'anotado' : 'servido';
    const isNotCurrentOrder = (o: BarOrder) => o.id !== orderId;
    fetch(`/api/waiter/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevoEstado }),
    }).then(r => {
      if (r.ok) {
        clearServedKeysForOrder(orderId);
        setOrders(prev => prev.filter(isNotCurrentOrder));
        const cleaned = new Set(servedKeysRef.current);
        cleaned.forEach(k => { if (k.startsWith(`${orderId}:`)) cleaned.delete(k); });
        persistServedKeys(cleaned);
        servedKeysRef.current = cleaned;
        setServedKeys(new Set(cleaned));
      } else {
        const rolled = new Set(servedKeysRef.current);
        rolled.delete(key);
        persistServedKeys(rolled);
        servedKeysRef.current = rolled;
        setServedKeys(new Set(rolled));
      }
    }).catch(() => {
      const rolled = new Set(servedKeysRef.current);
      rolled.delete(key);
      persistServedKeys(rolled);
      servedKeysRef.current = rolled;
      setServedKeys(new Set(rolled));
    });
  }, []);

  const startCountdown = useCallback((flatItem: FlatBarItem) => {
    const key = flatItem.key;
    if (timersRef.current.has(key)) return;
    pendingCountdownsRef.current.set(key, flatItem); // sync — no React batching delay
    setCountdowns(prev => ({ ...prev, [key]: COUNTDOWN_SECONDS }));
    const interval = setInterval(() => {
      setCountdowns(prev => {
        const remaining = (prev[key] ?? 1) - 1;
        if (remaining <= 0) {
          clearInterval(timersRef.current.get(key));
          timersRef.current.delete(key);
          pendingCountdownsRef.current.delete(key); // countdown done — remove from pending
          setTimeout(finishServingItem.bind(null, flatItem, key), 0);
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: remaining };
      });
    }, 1000);
    timersRef.current.set(key, interval);
  }, [finishServingItem]);

  const cancelCountdown = useCallback((key: string) => {
    pendingCountdownsRef.current.delete(key); // sync — ensure beforeunload won't fire this
    const interval = timersRef.current.get(key);
    if (interval) clearInterval(interval);
    timersRef.current.delete(key);
    setCountdowns(prev => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  // ── Swipe handlers ────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    swipingId.current = id;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (swipingId.current !== id || pointerStartX.current === null) return;
    applySwipeDragVisuals(e.currentTarget as HTMLElement, e.clientX - pointerStartX.current);
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, flatItem: FlatBarItem) => {
    if (swipingId.current !== flatItem.key || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingId.current = null;

    const snapContentBack = () => {
      const content = el.querySelector<HTMLElement>('[data-card-content]');
      const hint    = el.querySelector<HTMLElement>('[data-hint]');
      if (content) { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
      if (hint) { hint.style.opacity = '0'; }
    };

    if (Math.abs(delta) < SWIPE_THRESHOLD) { snapContentBack(); return; }

    if (delta > 0) {
      // Right swipe → cancel confirm
      snapContentBack();
      setPendingBarCancel([flatItem]);
      return;
    }

    // Left swipe → serve countdown
    snapContentBack();
    startCountdown(flatItem);
  }, [startCountdown]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const el         = e.currentTarget as HTMLElement;
    const content    = el.querySelector<HTMLElement>('[data-card-content]');
    const hint       = el.querySelector<HTMLElement>('[data-hint]');
    const cancelBg   = el.querySelector<HTMLElement>('[data-cancel-bg]');
    const cancelHint = el.querySelector<HTMLElement>('[data-cancel-hint]');
    if (content)    { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
    if (hint)       hint.style.opacity = '0';
    if (cancelBg)   cancelBg.style.background = 'transparent';
    if (cancelHint) cancelHint.style.opacity  = '0';
    pointerStartX.current = null;
    swipingId.current     = null;
  }, []);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsed(prev => { const n = new Set(prev); if (n.has(key)) { n.delete(key); } else { n.add(key); } return n; });
  }, []);

  const handleServeAllMesa = useCallback((mesaItems: FlatBarItem[]) => {
    mesaItems.forEach(item => startCountdown(item));
    setPendingServeAll(null);
  }, [startCountdown]);

  const handleBarCancel = useCallback(async () => {
    if (!pendingBarCancel) return;
    const items = pendingBarCancel;
    setPendingBarCancel(null);
    await Promise.all(items.map(item =>
      fetch(`/api/waiter/kitchen/items/${encodeURIComponent(item.orderId)}/${item.detallePedidoIdx}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cancelado' }),
      })
    ));
    setOrders(prev => cancelBarItems(prev, items));
  }, [pendingBarCancel]);

  const handleGroupPointerUp = useCallback((e: React.PointerEvent, groupKey: string, mergedItems: FlatBarItem[]) => {
    if (swipingId.current !== groupKey || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingId.current = null;
    const content    = el.querySelector<HTMLElement>('[data-card-content]');
    const hint       = el.querySelector<HTMLElement>('[data-hint]');
    const cancelBg   = el.querySelector<HTMLElement>('[data-cancel-bg]');
    const cancelHint = el.querySelector<HTMLElement>('[data-cancel-hint]');
    if (content)    { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
    if (hint)       hint.style.opacity = '0';
    if (cancelBg)   cancelBg.style.background = 'transparent';
    if (cancelHint) cancelHint.style.opacity = '0';
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta > 0) {
      setPendingBarCancel(mergedItems);
    } else {
      mergedItems.filter(i => !(i.key in countdowns) && !servedKeys.has(i.key)).forEach(i => startCountdown(i));
    }
  }, [countdowns, servedKeys, startCountdown]);

  // Flatten orders into one card per drink item, excluding locally served ones
  const flatItems: FlatBarItem[] = orders.flatMap(order =>
    order.items.map((item, idx) => ({
      key:               `${order.id}:${item.detallePedidoIdx}`,
      orderId:           order.id,
      itemIdx:           idx,
      detallePedidoIdx:  item.detallePedidoIdx,
      totalInOrder:      order.items.length,
      numeroPedido:      order.numeroPedido,
      mesaNumero:        order.mesaNumero,
      mesaNombre:        order.mesaNombre,
      createdAt:         order.createdAt,
      nombre:            item.nombre,
      cantidad:          item.cantidad,
      hasComida:         order.hasComida,
    }))
  ).filter(item => !servedKeys.has(item.key));

  const hasAnyContent = flatItems.length > 0;

  // ── Derived data ──────────────────────────────────────────────────────────
  const mesaGroups  = groupByMesa(flatItems);
  const orderGroups = groupByOrder(flatItems);
  const allKeys     = groupBy === 'mesa'
    ? Array.from(mesaGroups.keys())
    : Array.from(orderGroups.keys());
  const allCollapsed = allKeys.length > 0 && allKeys.every(k => collapsed.has(k));

  // ── Item card renderer ─────────────────────────────────────────────────────
  function renderDrinkCard(flatItem: FlatBarItem) {
    const timeColor   = getTimeColor(getElapsedMinutes(flatItem.createdAt));
    const isCountdown = flatItem.key in countdowns;
    const remaining   = countdowns[flatItem.key] ?? 0;
    const cardColor   = isCountdown ? COUNTDOWN_COLOR : timeColor;
    return (
      <div
        key={flatItem.key}
        className="relative rounded-xl overflow-hidden select-none"
        style={{ background: cardColor.bg, border: `1px solid ${cardColor.border}`, touchAction: 'pan-y', willChange: 'transform' }}
        onPointerDown={isCountdown ? undefined : e => handlePointerDown(e, flatItem.key)}
        onPointerMove={isCountdown ? undefined : e => handlePointerMove(e, flatItem.key)}
        onPointerUp={isCountdown ? undefined : e => handlePointerUp(e, flatItem)}
        onPointerCancel={isCountdown ? undefined : handlePointerCancel}
      >
        {!isCountdown && (<>
          {/* Right side reveal: serve hint */}
          <div className="absolute inset-0 flex items-center justify-end pr-3" style={{ background: 'oklch(28% 0.16 148)' }}>
            <span data-hint="" className="text-xs font-bold" style={{ color: KITCHEN_ALERT_ACCENT, opacity: 0 }}>
              {t('orderStatusServido', lang)} ✓
            </span>
          </div>
          {/* Left side reveal: cancel/trash — red */}
          <div data-cancel-bg="" className="absolute inset-0 flex items-center justify-start pl-3" style={{ background: 'transparent' }}>
            <span data-cancel-hint="" className="pointer-events-none flex items-center gap-1 text-[10px] font-bold" style={{ opacity: 0, color: 'oklch(80% 0.26 25)', transition: 'opacity 0.1s' }}>
              <Trash2 className="w-3 h-3 shrink-0" />
              {t('kitchenCancelSwipeHint', lang)}
            </span>
          </div>
        </>)}
        <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
          {isCountdown ? (
            <>
              <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-base font-bold"
                style={{ background: 'oklch(32% 0.20 148)', color: 'oklch(80% 0.22 148)', border: '2px solid oklch(55% 0.28 148 / 0.7)' }}>
                {remaining}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{flatItem.cantidad}× {flatItem.nombre}</span>
              </div>
              <button className="rounded px-2 py-1 text-[10px] font-bold shrink-0"
                style={{ background: 'oklch(26% 0.08 25)', color: 'oklch(75% 0.18 25)' }}
                onClick={() => cancelCountdown(flatItem.key)}>
                {t('kitchenCountdownCancel', lang)}
              </button>
            </>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{flatItem.cantidad}×</span>
                <span className="text-xs truncate" style={{ color: TEXT_MAIN }}>{flatItem.nombre}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderMergedDrinkCard(merged: MergedBarItem, mesaKey: string) {
    const anyCountdown = merged.items.some(i => i.key in countdowns);
    const allServed    = merged.items.every(i => servedKeys.has(i.key));
    if (allServed) return null;
    const minRemaining = anyCountdown ? getMergedGroupMinRemaining(merged.items, countdowns) : 0;
    const elapsed   = getElapsedMinutes(merged.createdAt);
    const cardColor = anyCountdown ? COUNTDOWN_COLOR : getTimeColor(elapsed);
    const groupKey  = `group:${mesaKey}:${merged.nombre}`;
    return (
      <div
        key={groupKey}
        className="relative rounded-xl overflow-hidden select-none"
        style={{ background: cardColor.bg, border: `1px solid ${cardColor.border}`, touchAction: 'pan-y', willChange: 'transform' }}
        onPointerDown={anyCountdown ? undefined : e => handlePointerDown(e, groupKey)}
        onPointerMove={anyCountdown ? undefined : e => handlePointerMove(e, groupKey)}
        onPointerUp={anyCountdown ? undefined : e => handleGroupPointerUp(e, groupKey, merged.items)}
        onPointerCancel={anyCountdown ? undefined : handlePointerCancel}
      >
        {!anyCountdown && (<>
          <div className="absolute inset-0 flex items-center justify-end pr-3" style={{ background: 'oklch(28% 0.16 148)' }}>
            <span data-hint="" className="text-xs font-bold" style={{ color: KITCHEN_ALERT_ACCENT, opacity: 0 }}>
              {t('orderStatusServido', lang)} ✓
            </span>
          </div>
          <div data-cancel-bg="" className="absolute inset-0 flex items-center justify-start pl-3" style={{ background: 'transparent' }}>
            <span data-cancel-hint="" className="pointer-events-none flex items-center gap-1 text-[10px] font-bold" style={{ opacity: 0, color: 'oklch(80% 0.26 25)', transition: 'opacity 0.1s' }}>
              <Trash2 className="w-3 h-3 shrink-0" />
              {t('kitchenCancelSwipeHint', lang)}
            </span>
          </div>
        </>)}
        <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
          {renderMergedCardInner(anyCountdown, minRemaining, merged, lang, cancelCountdown)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-10 shadow-lg"
        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(42% 0.10 252 / 0.35)' }}>
        {/* Row 1: back + title */}
        <div className="flex h-11 items-center gap-3 px-4">
          <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
            <ChevronLeft className="w-4 h-4" />
            {t('waiterLogout', lang)}
          </a>
          <Wine className="w-4 h-4" style={{ color: 'oklch(68% 0.14 252)' }} />
          <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{t('barTitle', lang)}</span>
          <span className="text-[10px]" style={{ color: TEXT_DIM }}>({flatItems.length})</span>
        </div>
        {/* Row 2: time legend */}
        <div className="flex flex-wrap gap-1 py-2 px-3">
          {TIME_COLORS.map(c => (
            <span key={c.label} className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
              {c.label}
            </span>
          ))}
        </div>
        {/* Row 3: filter toggles */}
        <div className="flex items-center gap-1 px-3 pb-2">
          {(['order', 'mesa'] as const).map(mode => {
            const isActive = groupBy === mode;
            const label = mode === 'order' ? t('kitchenGroupByOrder', lang) : t('kitchenGroupByTable', lang);
            return (
              <button key={mode} onClick={() => setGroupBy(mode)}
                className="rounded px-3 py-1 text-[11px] font-semibold transition-colors"
                style={isActive ? { background: 'oklch(32% 0.10 252)', color: TEXT_MAIN, border: '1px solid oklch(50% 0.10 252 / 0.6)' }
                  : { background: 'transparent', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.4)' }}>
                {label}
              </button>
            );
          })}
          {groupBy === 'mesa' && (
            <button
              className="ml-auto rounded p-1 transition-colors"
              style={{ background: allCollapsed ? 'oklch(30% 0.08 252)' : 'transparent', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.4)' }}
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allKeys))}
              title={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}>
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Serve-all confirmation modal */}
      {pendingServeAll && (() => {
        const mesaGroup = mesaGroups.get(pendingServeAll);
        const mesaItems = mesaGroup ? mesaGroup.items.filter(item => !(item.key in countdowns) && !servedKeys.has(item.key)) : [];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div className="rounded-2xl p-5 mx-4 max-w-xs w-full flex flex-col gap-4"
              style={{ background: 'oklch(18% 0.03 252)', border: '1px solid oklch(42% 0.10 252 / 0.5)' }}>
              <p className="text-sm text-center" style={{ color: TEXT_MAIN }}>
                {t('barServeAllConfirmMsg', lang)}
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-lg py-2 text-xs font-semibold"
                  style={{ background: 'oklch(22% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
                  onClick={() => setPendingServeAll(null)}>
                  {t('kitchenCountdownCancel', lang)}
                </button>
                <button
                  className="flex-1 rounded-lg py-2 text-xs font-semibold"
                  style={{ background: 'oklch(22% 0.10 148)', color: 'oklch(74% 0.20 148)', border: '1px solid oklch(46% 0.22 148 / 0.6)' }}
                  onClick={() => handleServeAllMesa(mesaItems)}>
                  {t('barServeAllConfirmYes', lang)}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bar cancel confirmation dialog */}
      {pendingBarCancel && (() => {
        const totalCant = pendingBarCancel.reduce((s, i) => s + i.cantidad, 0);
        const label = pendingBarCancel.length === 1
          ? `${pendingBarCancel[0].cantidad}× ${pendingBarCancel[0].nombre}`
          : `${totalCant} ítem(s) — ${pendingBarCancel[0].nombre}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
            <button
              type="button"
              className="absolute inset-0"
              style={{ background: 'oklch(0% 0 0 / 0.75)' }}
              onClick={() => setPendingBarCancel(null)}
              onKeyDown={e => { if (e.key === 'Escape') { setPendingBarCancel(null); } }}
              aria-label="Cerrar"
            />
            <dialog
              open
              className="relative w-full max-w-xs rounded-2xl flex flex-col gap-4"
              style={{ background: 'oklch(15% 0.06 25)', border: '2px solid oklch(50% 0.30 25 / 0.7)', margin: 0, padding: '1.25rem' }}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full" style={{ background: 'oklch(24% 0.24 25)', border: '2px solid oklch(50% 0.32 25 / 0.7)' }}>
                  <Trash2 className="w-5 h-5" style={{ color: 'oklch(82% 0.26 25)' }} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                    {t('kitchenCancelConfirmTitle', lang)}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'oklch(72% 0.16 252)' }}>
                    {label}
                  </span>
                  <span className="text-xs leading-relaxed mt-0.5" style={{ color: TEXT_DIM }}>
                    {t('kitchenCancelConfirmMsg', lang)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingBarCancel(null)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold"
                  style={{ background: 'oklch(20% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
                >
                  {t('kitchenCountdownCancel', lang)}
                </button>
                <button
                  onClick={handleBarCancel}
                  className="flex-1 rounded-lg px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: 'oklch(30% 0.28 25)', color: 'oklch(88% 0.26 25)', border: '2px solid oklch(52% 0.32 25 / 0.7)' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('kitchenCancelConfirmYes', lang)}
                </button>
              </div>
            </dialog>
          </div>
        );
      })()}

      <div className="pt-[112px] px-3 pb-6">
        {!hasAnyContent && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('barEmpty', lang)}
          </div>
        )}

        {/* Por pedido */}
        {groupBy === 'order' && hasAnyContent && (
          <div className="flex flex-col gap-4">
            {Array.from(orderGroups.entries()).map(([orderId, group]) => {
              const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
              const elapsed    = getElapsedMinutes(group.createdAt);
              return (
                <div key={orderId}>
                  <div className="flex items-center gap-2 px-1 mb-1.5">
                    <span className="text-xs font-bold" style={{ color: TEXT_DIM }}>#{group.numeroPedido}</span>
                    <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{tableLabel}</span>
                    <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                  </div>
                  <div className="flex flex-col gap-2">{group.items.map(renderDrinkCard)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Por mesa */}
        {groupBy === 'mesa' && hasAnyContent && (
          <div className="flex flex-col gap-3">
            {Array.from(mesaGroups.entries()).map(([mesaKey, group]) => {
              const isCollapsed  = collapsed.has(mesaKey);
              const isGrouped    = groupedMesas.has(mesaKey);
              const displayLabel = mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey;
              // Always sort items by nombre for consistent ordering
              const sortedItems  = [...group.items].sort((a, b) => a.nombre.localeCompare(b.nombre));
              const mergedItems  = isGrouped ? groupMesaItems(group.items) : null;
              return (
                <div key={mesaKey} className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}>
                  <div
                    className="flex items-center"
                    style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}>
                    <button
                      className="flex flex-1 items-center gap-2 px-3 py-2.5 min-w-0"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onClick={() => toggleCollapse(mesaKey)}>
                      <Table2 className="w-4 h-4 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
                      <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{displayLabel}</span>
                      <ChevronDown className="w-4 h-4 shrink-0 ml-auto" style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                    </button>
                    <div className="flex items-center gap-2 pr-3 shrink-0">
                      <button
                        onClick={() => setGroupedMesas(prev => {
                          const n = new Set(prev);
                          if (n.has(mesaKey)) n.delete(mesaKey); else n.add(mesaKey);
                          return n;
                        })}
                        title="Agrupar por nombre"
                        className="flex items-center justify-center rounded-lg transition-colors"
                        style={{
                          width: 36, height: 32,
                          background: isGrouped ? 'oklch(30% 0.16 252)' : 'transparent',
                          color: isGrouped ? 'oklch(80% 0.18 252)' : TEXT_DIM,
                          border: `1px solid ${isGrouped ? 'oklch(52% 0.18 252 / 0.6)' : 'oklch(35% 0.06 252 / 0.4)'}`,
                        }}>
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setPendingServeAll(mesaKey)}
                        title={t('barServeAllConfirmYes', lang)}
                        className="flex items-center justify-center rounded-lg"
                        style={{ width: 44, height: 32, background: 'oklch(22% 0.10 148)', color: 'oklch(74% 0.20 148)', border: '1px solid oklch(46% 0.22 148 / 0.6)' }}>
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-2 p-2">
                      {isGrouped && mergedItems ? mergedItems.map(merged => renderMergedDrinkCard(merged, mesaKey)) : sortedItems.map(renderDrinkCard)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
