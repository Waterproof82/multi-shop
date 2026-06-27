'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { useSearchParams } from 'next/navigation';
import { useLanguage, type Language } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft, ChevronDown, ChevronsUpDown, TimerOff, CheckCheck, PlayCircle, Pause, Table2, Trash2, Layers } from 'lucide-react';
import type { ItemEstado } from '@/core/domain/repositories/IPedidoRepository';

interface KitchenItem {
  pedidoId: string;
  numeroPedido: number;
  itemIdx: number;
  nombre: string;
  cantidad: number;
  complementos?: string;
  estado: ItemEstado;
  mesaId?: string | null;
  mesaNumero: number | null;
  mesaNombre: string | null;
  createdAt: string;
}

const BG        = 'oklch(13% 0.02 252)';
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

// Time-based colors for "nuevo" items (pendiente / en_preparacion)
const TIME_COLORS = [
  { max: 10,       label: '< 10 min',  bg: 'oklch(18% 0.06 228)', border: 'oklch(50% 0.22 228 / 0.55)', text: 'oklch(72% 0.20 228)' },
  { max: 20,       label: '10 – 20 m', bg: 'oklch(19% 0.09 168)', border: 'oklch(52% 0.26 168 / 0.55)', text: 'oklch(74% 0.24 168)' },
  { max: 30,       label: '20 – 30 m', bg: 'oklch(22% 0.14 100)', border: 'oklch(56% 0.28 100 / 0.55)', text: 'oklch(78% 0.26 100)' },
  { max: 45,       label: '30 – 45 m', bg: 'oklch(24% 0.18 68)',  border: 'oklch(58% 0.30 68  / 0.60)', text: 'oklch(80% 0.28 68)'  },
  { max: 60,       label: '45 – 60 m', bg: 'oklch(24% 0.20 35)',  border: 'oklch(58% 0.33 35  / 0.65)', text: 'oklch(80% 0.30 35)'  },
  { max: Infinity, label: '60+ min',   bg: 'oklch(22% 0.22 16)',  border: 'oklch(56% 0.36 16  / 0.70)', text: 'oklch(78% 0.34 16)'  },
];

const LISTO_COLOR    = { bg: 'oklch(22% 0.18 148)', border: 'oklch(52% 0.26 148 / 0.65)' };
const RETENIDO_COLOR = { bg: 'oklch(21% 0.10 65)',  border: 'oklch(50% 0.22 65  / 0.55)' };

const THRESHOLD = 80;

function getTimeColor(minutes: number) {
  for (const c of TIME_COLORS) if (minutes < c.max) return c;
  return TIME_COLORS.at(-1)!;
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function groupByPedido(items: KitchenItem[]) {
  return items.reduce<Map<string, { numeroPedido: number; mesaNumero: number | null; mesaNombre: string | null; createdAt: string; items: KitchenItem[] }>>(
    (acc, item) => {
      if (!acc.has(item.pedidoId)) {
        acc.set(item.pedidoId, {
          numeroPedido: item.numeroPedido,
          mesaNumero:   item.mesaNumero,
          mesaNombre:   item.mesaNombre,
          createdAt:    item.createdAt,
          items: [],
        });
      }
      acc.get(item.pedidoId)!.items.push(item);
      return acc;
    },
    new Map()
  );
}

function groupByMesa(items: KitchenItem[]) {
  const map = new Map<string, { mesaNumero: number | null; mesaNombre: string | null; firstCreatedAt: string; items: KitchenItem[] }>();
  for (const item of items) {
    const key = item.mesaNombre ?? `Mesa ${item.mesaNumero ?? '—'}`;
    if (!map.has(key)) {
      map.set(key, { mesaNumero: item.mesaNumero, mesaNombre: item.mesaNombre, firstCreatedAt: item.createdAt, items: [] });
    }
    const group = map.get(key)!;
    if (item.createdAt < group.firstCreatedAt) group.firstCreatedAt = item.createdAt;
    group.items.push(item);
  }
  // Sort mesas by earliest order arrival
  return new Map([...map.entries()].sort((a, b) => a[1].firstCreatedAt.localeCompare(b[1].firstCreatedAt)));
}

interface MergedKitchenItem {
  mergeKey: string;
  nombre: string;
  complementos?: string;
  totalCantidad: number;
  representativeEstado: ItemEstado;
  firstCreatedAt: string;
  items: KitchenItem[];
}

function groupKitchenMesaItems(items: KitchenItem[]): MergedKitchenItem[] {
  const map = new Map<string, MergedKitchenItem>();
  for (const item of items) {
    // Include estado in key: same name but different estado stays separate
    const key = `${item.nombre}|${item.complementos ?? ''}|${item.estado}`;
    if (!map.has(key)) {
      map.set(key, {
        mergeKey: key,
        nombre: item.nombre,
        complementos: item.complementos,
        totalCantidad: 0,
        representativeEstado: item.estado,
        firstCreatedAt: item.createdAt,
        items: [],
      });
    }
    const g = map.get(key)!;
    g.totalCantidad += item.cantidad;
    if (item.createdAt < g.firstCreatedAt) g.firstCreatedAt = item.createdAt;
    g.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => {
    const nameComp = a.nombre.localeCompare(b.nombre);
    return nameComp === 0 ? a.representativeEstado.localeCompare(b.representativeEstado) : nameComp;
  });
}

function makeKey(pedidoId: string, itemIdx: number) {
  return `${pedidoId}:${itemIdx}`;
}

function itemStateKey(item: KitchenItem) {
  return `${item.pedidoId}:${item.itemIdx}`;
}

function getKitchenSortOrder(estado: string): number {
  if (estado === 'listo') return 0;
  if (estado === 'retenido') return 2;
  return 1;
}

type SwipeEls = { bg: HTMLElement | null; hint: HTMLElement | null; cancelBg: HTMLElement | null; cancelHint: HTMLElement | null };

function applyLeftSwipe(els: SwipeEls, delta: number, actionBg: string) {
  if (els.bg) els.bg.style.background = delta < -20 ? actionBg : 'transparent';
  if (els.hint) els.hint.style.opacity = String(Math.min(1, -delta / THRESHOLD));
  if (els.cancelBg) els.cancelBg.style.background = 'transparent';
  if (els.cancelHint) els.cancelHint.style.opacity = '0';
}

function applyRightSwipe(els: SwipeEls, delta: number) {
  if (els.bg) els.bg.style.background = 'transparent';
  if (els.hint) els.hint.style.opacity = '0';
  if (els.cancelBg) els.cancelBg.style.background = delta > 20 ? 'oklch(28% 0.22 25)' : 'transparent';
  if (els.cancelHint) els.cancelHint.style.opacity = delta > 20 ? String(Math.min(1, (delta - 20) / THRESHOLD)) : '0';
}

function applyKitchenSwipeVisuals(el: HTMLElement, delta: number) {
  const content = el.querySelector<HTMLElement>('[data-card-content]');
  if (content) { content.style.transform = `translateX(${delta}px)`; content.style.transition = 'none'; }
  const els: SwipeEls = {
    bg:         el.querySelector<HTMLElement>('[data-reveal-bg]'),
    hint:       el.querySelector<HTMLElement>('[data-hint]'),
    cancelBg:   el.querySelector<HTMLElement>('[data-cancel-bg]'),
    cancelHint: el.querySelector<HTMLElement>('[data-cancel-hint]'),
  };
  if (delta < 0) {
    applyLeftSwipe(els, delta, el.dataset.actionColor ?? 'oklch(28% 0.16 148)');
  } else {
    applyRightSwipe(els, delta);
  }
}

function snapCardInstant(el: HTMLElement) {
  const content    = el.querySelector<HTMLElement>('[data-card-content]');
  const bg         = el.querySelector<HTMLElement>('[data-reveal-bg]');
  const hint       = el.querySelector<HTMLElement>('[data-hint]');
  const cancelBg   = el.querySelector<HTMLElement>('[data-cancel-bg]');
  const cancelHint = el.querySelector<HTMLElement>('[data-cancel-hint]');
  if (content)    { content.style.transition = 'none'; content.style.transform = 'translateX(0)'; }
  if (bg)         bg.style.background = 'transparent';
  if (hint)       hint.style.opacity  = '0';
  if (cancelBg)   cancelBg.style.background = 'transparent';
  if (cancelHint) cancelHint.style.opacity  = '0';
}


function getItemCardColor(estado: ItemEstado, elapsed: number): { bg: string; border: string } {
  if (estado === 'listo') return LISTO_COLOR;
  if (estado === 'retenido') return RETENIDO_COLOR;
  return getTimeColor(elapsed);
}

function getItemHintText(estado: ItemEstado, lang: Language): string {
  if (estado === 'listo') return t('kitchenSwipeToServe', lang);
  if (estado === 'retenido') return t('kitchenSwipeRestore', lang);
  return t('kitchenSwipeToRetenido', lang);
}

function getItemBadgeStyle(estado: ItemEstado): { background: string; color: string } {
  if (estado === 'listo')          return { background: 'oklch(28% 0.16 148 / 0.5)', color: 'oklch(80% 0.22 148)' };
  if (estado === 'en_preparacion') return { background: 'oklch(32% 0.16 90 / 0.5)',  color: 'oklch(82% 0.20 90)' };
  if (estado === 'retenido')       return { background: 'oklch(28% 0.14 65 / 0.5)',  color: 'oklch(78% 0.20 65)' };
  return { background: 'oklch(30% 0.10 252 / 0.4)', color: 'oklch(75% 0.12 252)' };
}

function getItemStatusText(estado: ItemEstado, lang: Language): string {
  if (estado === 'listo')          return t('kitchenItemListo', lang);
  if (estado === 'retenido')       return t('kitchenItemRetenido', lang);
  if (estado === 'en_preparacion') return t('orderStatusAnotado', lang);
  return t('orderStatusPending', lang);
}

function getItemActionColor(estado: ItemEstado): string {
  if (estado === 'retenido') return 'oklch(28% 0.12 65)';
  if (estado === 'listo')    return 'oklch(28% 0.16 148)';
  return RETENIDO_COLOR.bg;
}

export default function WaiterKitchenPage() {
  const { language } = useLanguage();
  const lang = language;
  const searchParams = useSearchParams();
  const targetMesa = searchParams.get('mesa');
  const initialGroupBy = searchParams.get('groupBy') as 'order' | 'mesa' | 'listos' | 'retenidos' | null;
  const [items, setItems] = useState<KitchenItem[]>([]);
  const [groupBy, setGroupBy] = useState<'order' | 'mesa' | 'listos' | 'retenidos'>(
    initialGroupBy === 'retenidos' || initialGroupBy === 'listos' || initialGroupBy === 'mesa' ? initialGroupBy : 'order'
  );
  const [servingMesas, setServingMesas] = useState<Set<string>>(new Set());
  const [liberatingMesas, setLiberatingMesas] = useState<Set<string>>(new Set());
  const [pendingRetain, setPendingRetain] = useState<KitchenItem | null>(null);
  const [pendingCancel, setPendingCancel] = useState<KitchenItem[] | null>(null);
  const [collapsedMesas, setCollapsedMesas] = useState<Set<string>>(new Set());
  const [groupedMesas, setGroupedMesas] = useState<Set<string>>(new Set());
  const [pendingMergedWaiterAction, setPendingMergedWaiterAction] = useState<{ items: KitchenItem[]; action: ItemEstado } | null>(null);
  const channelNameRef = useRef(`waiter-kitchen-${Math.random().toString(36).slice(2)}`);
  const pointerStartX = useRef<number | null>(null);
  const swipingKey    = useRef<string | null>(null);
  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/kitchen/items');
      if (r.ok) {
        const json = await r.json() as { items: KitchenItem[] };
        setItems(json.items ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchItems();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchItems(); }, 100);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchItems(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-kitchen-items error:', status);
        }
      });

    // Broadcast channel — receives 'item-update' events from the DB trigger
    // (notify_waiter_items_update) whenever pedido_item_estados rows change.
    // Bypasses the postgres_changes routing issue on the shared singleton client.
    const broadcastChannel = supabase
      .channel('waiter-items-update')
      .on('broadcast', { event: 'item-update' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchItems(); }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-items-update broadcast error (kitchen):', status);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(broadcastChannel);
    };
  }, [fetchItems]);

  useEffect(() => {
    const tick = setInterval(() => setItems(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // Scroll to target mesa and collapse all others when arriving from grid with a mesa param
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!targetMesa || scrolledRef.current || items.length === 0) return;
    scrolledRef.current = true;

    // Collapse all mesas except the target one
    let sourceItems: KitchenItem[];
    if (groupBy === 'listos') {
      sourceItems = items.filter(i => i.estado === 'listo');
    } else if (groupBy === 'retenidos') {
      sourceItems = items.filter(i => i.estado === 'retenido');
    } else {
      sourceItems = items;
    }
    const allKeys = Array.from(groupByMesa(sourceItems).keys());
    const toCollapse = new Set(allKeys.filter(k => k !== targetMesa));
    if (toCollapse.size > 0) setCollapsedMesas(toCollapse);

    const id = `mesa-section-${targetMesa}`;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [items, targetMesa, groupBy]);

  // ── PATCH helper ───────────────────────────────────────────────────────────

  const patchEstado = useCallback(async (pedidoId: string, itemIdx: number, estado: ItemEstado, onSuccess: () => void) => {
    const r = await fetch(`/api/waiter/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    if (r.ok) onSuccess();
  }, []);

  const setItemEstado = useCallback((pedidoId: string, itemIdx: number, newEstado: ItemEstado) => {
    setItems(prev => prev.map(i =>
      i.pedidoId === pedidoId && i.itemIdx === itemIdx ? { ...i, estado: newEstado } : i
    ));
  }, []);

  const removeItem = useCallback((pedidoId: string, itemIdx: number) => {
    setItems(prev => prev.filter(i => !(i.pedidoId === pedidoId && i.itemIdx === itemIdx)));
  }, []);

  // ── Swipe handlers ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, key: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    swipingKey.current = key;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, key: string) => {
    if (swipingKey.current !== key || pointerStartX.current === null) return;
    applyKitchenSwipeVisuals(e.currentTarget as HTMLElement, e.clientX - pointerStartX.current);
  }, []);

  const snapBack = useCallback((el: HTMLElement) => {
    const content    = el.querySelector<HTMLElement>('[data-card-content]');
    const bg         = el.querySelector<HTMLElement>('[data-reveal-bg]');
    const hint       = el.querySelector<HTMLElement>('[data-hint]');
    const cancelBg   = el.querySelector<HTMLElement>('[data-cancel-bg]');
    const cancelHint = el.querySelector<HTMLElement>('[data-cancel-hint]');
    if (content) { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
    if (bg)         bg.style.background   = 'transparent';
    if (hint)       hint.style.opacity    = '0';
    if (cancelBg)   cancelBg.style.background = 'transparent';
    if (cancelHint) cancelHint.style.opacity  = '0';
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, item: KitchenItem) => {
    const key = makeKey(item.pedidoId, item.itemIdx);
    if (swipingKey.current !== key || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingKey.current    = null;

    if (Math.abs(delta) < THRESHOLD) { snapBack(el); return; }

    // Right swipe → cancel confirm (all estados)
    if (delta > 0) {
      snapBack(el);
      setPendingCancel([item]);
      return;
    }

    const isNuevo    = item.estado === 'pendiente' || item.estado === 'en_preparacion';
    const isListo    = item.estado === 'listo';
    const isRetenido = item.estado === 'retenido';

    if (isNuevo) {
      if (item.estado === 'en_preparacion') {
        // Item already being prepared — ask for confirmation before retaining
        snapBack(el);
        setPendingRetain(item);
      } else {
        // Pendiente — retain immediately
        if (groupBy === 'mesa') {
          snapBack(el);
        } else {
          snapCardInstant(el);
          el.style.transition = 'transform 0.18s ease';
          el.style.transform  = 'translateX(-110%)';
        }
        void patchEstado(item.pedidoId, item.itemIdx, 'retenido', () => setItemEstado(item.pedidoId, item.itemIdx, 'retenido'));
      }
    } else if (isListo) {
      // Left swipe on listo → servido: snap inner content, fly outer card left
      snapCardInstant(el);
      el.style.transition = 'transform 0.18s ease';
      el.style.transform  = 'translateX(-110%)';
      void patchEstado(item.pedidoId, item.itemIdx, 'servido', () => removeItem(item.pedidoId, item.itemIdx));
    } else if (isRetenido) {
      // Left swipe on retenido → restore to pendiente
      snapBack(el);
      void patchEstado(item.pedidoId, item.itemIdx, 'pendiente', () => setItemEstado(item.pedidoId, item.itemIdx, 'pendiente'));
    } else {
      snapBack(el);
    }
  }, [patchEstado, snapBack, groupBy, setPendingRetain, setItemEstado, removeItem]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    snapBack(e.currentTarget as HTMLElement);
    pointerStartX.current = null;
    swipingKey.current    = null;
  }, [snapBack]);

  const handlePointerUpMerged = useCallback((e: React.PointerEvent, mergedKey: string, merged: MergedKitchenItem) => {
    if (swipingKey.current !== mergedKey || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingKey.current    = null;
    if (Math.abs(delta) < THRESHOLD) { snapBack(el); return; }

    if (delta > 0) {
      // Right swipe → cancel all
      snapBack(el);
      setPendingCancel(merged.items);
      return;
    }

    // Left swipe → advance/revert state
    snapBack(el);
    const estado = merged.representativeEstado;
    const isNuevo    = estado === 'pendiente' || estado === 'en_preparacion';
    const isListo    = estado === 'listo';
    const isRetenido = estado === 'retenido';
    if (isNuevo)         setPendingMergedWaiterAction({ items: merged.items, action: 'retenido' });
    else if (isListo)    setPendingMergedWaiterAction({ items: merged.items, action: 'servido' });
    else if (isRetenido) setPendingMergedWaiterAction({ items: merged.items, action: 'pendiente' });
  }, [snapBack]);

  const confirmMergedWaiterAction = useCallback(async () => {
    if (!pendingMergedWaiterAction) return;
    const { items: toProcess, action } = pendingMergedWaiterAction;
    setPendingMergedWaiterAction(null);
    await Promise.all(toProcess.map(item => {
      const onSuccess = action === 'servido'
        ? () => removeItem(item.pedidoId, item.itemIdx)
        : () => setItemEstado(item.pedidoId, item.itemIdx, action);
      return patchEstado(item.pedidoId, item.itemIdx, action, onSuccess);
    }));
  }, [pendingMergedWaiterAction, patchEstado, setItemEstado, removeItem]);

  // ── Sections ───────────────────────────────────────────────────────────────

  const nuevosItems   = items.filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion');
  const listosItems   = items.filter(i => i.estado === 'listo');
  const retenidoItems = items.filter(i => i.estado === 'retenido');
  const hasAny        = items.length > 0;

  const handleTodosServidos = useCallback(async (mesaKey: string, listosInMesa: KitchenItem[]) => {
    if (listosInMesa.length === 0) return;
    setServingMesas(prev => new Set(prev).add(mesaKey));
    try {
      await Promise.all(listosInMesa.map(item =>
        fetch(`/api/waiter/kitchen/items/${encodeURIComponent(item.pedidoId)}/${item.itemIdx}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'servido' }),
        })
      ));
      const doneKeys = new Set(listosInMesa.map(itemStateKey));
      setItems(prev => prev.filter(i => !doneKeys.has(itemStateKey(i))));
    } finally {
      setServingMesas(prev => { const next = new Set(prev); next.delete(mesaKey); return next; });
    }
  }, []);

  const handleLiberarRetenidosMesa = useCallback(async (mesaKey: string, retenidos: KitchenItem[]) => {
    setLiberatingMesas(prev => new Set(prev).add(mesaKey));
    try {
      await Promise.all(retenidos.map(item =>
        fetch(`/api/waiter/kitchen/items/${encodeURIComponent(item.pedidoId)}/${item.itemIdx}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'pendiente' }),
        })
      ));
      const retenidoKeys = new Set(retenidos.map(itemStateKey));
      setItems(prev => prev.map(i =>
        retenidoKeys.has(itemStateKey(i)) ? { ...i, estado: 'pendiente' } : i
      ));
    } finally {
      setLiberatingMesas(prev => { const next = new Set(prev); next.delete(mesaKey); return next; });
    }
  }, []);

  const toggleMesaCollapse = useCallback((mesaKey: string) => {
    setCollapsedMesas(prev => {
      const next = new Set(prev);
      if (next.has(mesaKey)) next.delete(mesaKey); else next.add(mesaKey);
      return next;
    });
  }, []);

  const confirmRetain = useCallback(async () => {
    if (!pendingRetain) return;
    const item = pendingRetain;
    setPendingRetain(null);
    await patchEstado(item.pedidoId, item.itemIdx, 'retenido', () => setItemEstado(item.pedidoId, item.itemIdx, 'retenido'));
  }, [pendingRetain, patchEstado, setItemEstado]);

  const confirmCancel = useCallback(async () => {
    if (!pendingCancel) return;
    const toCancel = pendingCancel;
    setPendingCancel(null);
    await Promise.all(toCancel.map(item =>
      patchEstado(item.pedidoId, item.itemIdx, 'cancelado', () => removeItem(item.pedidoId, item.itemIdx))
    ));
  }, [pendingCancel, patchEstado, removeItem]);

  function renderItemCard(item: KitchenItem) {
    const key        = makeKey(item.pedidoId, item.itemIdx);
    const isListo    = item.estado === 'listo';
    const isRetenido = item.estado === 'retenido';
    const elapsed    = getElapsedMinutes(item.createdAt);
    const cardColor  = getItemCardColor(item.estado, elapsed);
    const hintText   = getItemHintText(item.estado, lang);
    const hintColor  = isListo ? 'oklch(75% 0.18 148)' : 'oklch(75% 0.20 65)';
    const badgeStyle = getItemBadgeStyle(item.estado);
    const statusText = getItemStatusText(item.estado, lang);

    return (
      <div
        key={key}
        className="relative rounded-xl overflow-hidden select-none"
        data-action-color={getItemActionColor(item.estado)}
        style={{
          background:  cardColor.bg,
          border:      `1px solid ${cardColor.border}`,
          touchAction: 'pan-y',
          willChange:  'transform',
        }}
        onPointerDown={e => handlePointerDown(e, key)}
        onPointerMove={e => handlePointerMove(e, key)}
        onPointerUp={e => handlePointerUp(e, item)}
        onPointerCancel={handlePointerCancel}
      >
        {/* Right side reveal (left drag) — action hint */}
        <div data-reveal-bg="" className="pointer-events-none absolute inset-0 flex items-center justify-end px-3" style={{ background: 'transparent' }}>
          <span
            data-hint=""
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ opacity: 0, color: hintColor, transition: 'opacity 0.1s' }}
          >
            {!isRetenido && !isListo && <Pause className="w-3 h-3 shrink-0" />}
            {hintText}
          </span>
        </div>
        {/* Left side reveal (right drag) — cancel/trash */}
        <div data-cancel-bg="" className="pointer-events-none absolute inset-0 flex items-center justify-start px-3" style={{ background: 'transparent' }}>
          <span
            data-cancel-hint=""
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ opacity: 0, color: 'oklch(78% 0.24 25)', transition: 'opacity 0.1s' }}
          >
            <Trash2 className="w-3 h-3 shrink-0" />
            {t('kitchenCancelSwipeHint', lang)}
          </span>
        </div>

        {/* Card content — this div translates during drag */}
        <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{item.cantidad}×</span>
              <span className="text-xs truncate" style={{ color: TEXT_MAIN }}>{item.nombre || '—'}</span>
            </div>
            {item.complementos && (
              <div className="mt-0.5">
                <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({item.complementos})</span>
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={badgeStyle}
            >
              {isRetenido && <Pause className="w-2.5 h-2.5" />}
              {statusText}
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderMergedCard(merged: MergedKitchenItem) {
    const mKey        = `merged:${merged.mergeKey}`;
    const isListo     = merged.representativeEstado === 'listo';
    const isRetenido  = merged.representativeEstado === 'retenido';
    const isEnPrep    = merged.representativeEstado === 'en_preparacion';
    const elapsed     = getElapsedMinutes(merged.firstCreatedAt);

    let cardColor: { bg: string; border: string };
    if (isListo) {
      cardColor = LISTO_COLOR;
    } else if (isRetenido) {
      cardColor = RETENIDO_COLOR;
    } else {
      cardColor = getTimeColor(elapsed);
    }

    let hintText: string;
    if (isListo) {
      hintText = t('kitchenSwipeToServe', lang);
    } else if (isRetenido) {
      hintText = t('kitchenSwipeRestore', lang);
    } else {
      hintText = t('kitchenSwipeToRetenido', lang);
    }

    const hintColor = isListo ? 'oklch(75% 0.18 148)' : 'oklch(75% 0.20 65)';

    let badgeStyle: { background: string; color: string };
    if (isListo) {
      badgeStyle = { background: 'oklch(28% 0.16 148 / 0.5)', color: 'oklch(80% 0.22 148)' };
    } else if (isEnPrep) {
      badgeStyle = { background: 'oklch(32% 0.16 90 / 0.5)',  color: 'oklch(82% 0.20 90)' };
    } else if (isRetenido) {
      badgeStyle = { background: 'oklch(28% 0.14 65 / 0.5)',  color: 'oklch(78% 0.20 65)' };
    } else {
      badgeStyle = { background: 'oklch(30% 0.10 252 / 0.4)', color: 'oklch(75% 0.12 252)' };
    }

    let statusText: string;
    if (isListo) {
      statusText = t('kitchenItemListo', lang);
    } else if (isRetenido) {
      statusText = t('kitchenItemRetenido', lang);
    } else if (isEnPrep) {
      statusText = t('orderStatusAnotado', lang);
    } else {
      statusText = t('orderStatusPending', lang);
    }

    const mergedActionColor = isRetenido
      ? 'oklch(28% 0.12 65)'
      : isListo
        ? 'oklch(28% 0.16 148)'
        : RETENIDO_COLOR.bg;

    return (
      <div
        key={mKey}
        className="relative rounded-xl overflow-hidden select-none"
        data-action-color={mergedActionColor}
        style={{ background: cardColor.bg, border: `1px solid ${cardColor.border}`, touchAction: 'pan-y', willChange: 'transform' }}
        onPointerDown={e => handlePointerDown(e, mKey)}
        onPointerMove={e => handlePointerMove(e, mKey)}
        onPointerUp={e => handlePointerUpMerged(e, mKey, merged)}
        onPointerCancel={handlePointerCancel}
      >
        {/* Right side reveal (left drag) — action hint */}
        <div data-reveal-bg="" className="pointer-events-none absolute inset-0 flex items-center justify-end px-3" style={{ background: 'transparent' }}>
          <span
            data-hint=""
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ opacity: 0, color: hintColor, transition: 'opacity 0.1s' }}
          >
            {!isRetenido && !isListo && <Pause className="w-3 h-3 shrink-0" />}
            {hintText}
          </span>
        </div>
        {/* Left side reveal (right drag) — cancel all */}
        <div data-cancel-bg="" className="pointer-events-none absolute inset-0 flex items-center justify-start px-3" style={{ background: 'transparent' }}>
          <span
            data-cancel-hint=""
            className="flex items-center gap-1 text-[10px] font-bold"
            style={{ opacity: 0, color: 'oklch(78% 0.24 25)', transition: 'opacity 0.1s' }}
          >
            <Trash2 className="w-3 h-3 shrink-0" />
            {t('kitchenCancelSwipeHint', lang)}
          </span>
        </div>
        <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{merged.totalCantidad}×</span>
              <span className="text-xs truncate" style={{ color: TEXT_MAIN }}>{merged.nombre}</span>
            </div>
            {merged.complementos && (
              <div className="mt-0.5">
                <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({merged.complementos})</span>
              </div>
            )}
          </div>
          <div className="shrink-0">
            <span
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={badgeStyle}
            >
              {isRetenido && <Pause className="w-2.5 h-2.5" />}
              {statusText}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div
        className="fixed top-0 left-0 right-0 z-10 shadow-lg"
        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(42% 0.14 62 / 0.35)' }}
      >
        {/* Row 1: back + title */}
        <div className="flex h-11 items-center gap-3 px-4">
          <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
            <ChevronLeft className="w-4 h-4" />
            {t('waiterLogout', lang)}
          </a>
          <UtensilsCrossed className="w-4 h-4" style={{ color: 'oklch(72% 0.14 62)' }} />
          <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{t('kitchenTitle', lang)}</span>
          <span className="text-[10px]" style={{ color: TEXT_DIM }}>({nuevosItems.length + listosItems.length})</span>
        </div>
        {/* Row 2: time legend */}
        <div className="flex flex-wrap gap-1 py-2 px-3">
          {TIME_COLORS.map((c) => (
            <span
              key={c.label}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            >
              {c.label}
            </span>
          ))}
        </div>
        {/* Row 3: filter toggle */}
        <div className="flex items-center gap-1 px-3 pb-2 flex-wrap">
          {/* Group: Por pedido / Por mesa */}
          {(['order', 'mesa'] as const).map(mode => {
            const isActive = groupBy === mode;
            const label = mode === 'order' ? t('kitchenGroupByOrder', lang) : t('kitchenGroupByTable', lang);
            return (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className="rounded px-3 py-1 text-[11px] font-semibold transition-colors"
                style={isActive
                  ? { background: 'oklch(32% 0.10 252)', color: TEXT_MAIN, border: '1px solid oklch(50% 0.10 252 / 0.6)' }
                  : { background: 'transparent', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.4)' }
                }
              >
                {label}
              </button>
            );
          })}

          {/* Separator */}
          <span style={{ width: 1, height: 18, background: 'oklch(38% 0.06 252 / 0.5)', margin: '0 4px', display: 'inline-block', alignSelf: 'center' }} />

          {/* Group: Listos / Retenidos */}
          {(['listos', 'retenidos'] as const).map(mode => {
            const isActive    = groupBy === mode;
            const isListos    = mode === 'listos';
            const label = isListos ? t('kitchenListos', lang) : t('waiterRetenidos', lang);
            const activeStyle = isListos
              ? { background: 'oklch(26% 0.16 148)', color: 'oklch(80% 0.22 148)', border: '1px solid oklch(52% 0.26 148 / 0.7)' }
              : { background: 'oklch(24% 0.06 252)', color: TEXT_DIM, border: '1px solid oklch(48% 0.08 252 / 0.6)' };
            return (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className="rounded px-3 py-1 text-[11px] font-semibold transition-colors"
                style={isActive ? activeStyle : { background: 'transparent', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.4)' }}
              >
                {label}
              </button>
            );
          })}
          {groupBy !== 'order' && (() => {
            let sourceItems: KitchenItem[];
            if (groupBy === 'listos') {
              sourceItems = listosItems;
            } else if (groupBy === 'retenidos') {
              sourceItems = retenidoItems;
            } else {
              sourceItems = items;
            }
            const mesaKeys = Array.from(groupByMesa(sourceItems).keys());
            const allCollapsed = mesaKeys.length > 0 && mesaKeys.every(k => collapsedMesas.has(k));
            return (
              <button
                className="ml-auto rounded p-1 transition-colors"
                style={{
                  background: allCollapsed ? 'oklch(30% 0.08 252)' : 'transparent',
                  color: TEXT_DIM,
                  border: '1px solid oklch(35% 0.06 252 / 0.4)',
                }}
                onClick={() => {
                  if (allCollapsed) {
                    setCollapsedMesas(new Set());
                  } else {
                    setCollapsedMesas(new Set(mesaKeys));
                  }
                }}
                title={allCollapsed ? 'Expandir todo' : 'Colapsar todo'}
              >
                <ChevronsUpDown className="w-3.5 h-3.5" />
              </button>
            );
          })()}
        </div>
      </div>

      <div className="pt-[112px] px-3 pb-6">
        {!hasAny && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('kitchenEmpty', lang)}
          </div>
        )}

        {groupBy === 'order' && (<>
          {/* Nuevos */}
          {nuevosItems.length > 0 && (
            <div className="mb-4">
              <div className="px-1 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_DIM }}>
                  {t('kitchenNuevos', lang)} ({nuevosItems.length})
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {Array.from(groupByPedido(nuevosItems).entries()).map(([pedidoId, group]) => {
                  const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
                  const elapsed    = getElapsedMinutes(group.createdAt);
                  return (
                    <div key={pedidoId}>
                      <div className="flex items-center gap-2 px-1 mb-1.5">
                        <span className="text-xs font-bold" style={{ color: 'oklch(72% 0.14 62)' }}>#{group.numeroPedido}</span>
                        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{tableLabel}</span>
                        <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                      </div>
                      <div className="flex flex-col gap-2">{group.items.map(renderItemCard)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Listos */}
          {listosItems.length > 0 && (
            <div className="mb-4">
              <div className="px-1 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(65% 0.18 148)' }}>
                  {t('kitchenListos', lang)} ({listosItems.length})
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {Array.from(groupByPedido(listosItems).entries()).map(([pedidoId, group]) => {
                  const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
                  const elapsed    = getElapsedMinutes(group.createdAt);
                  return (
                    <div key={pedidoId}>
                      <div className="flex items-center gap-2 px-1 mb-1.5">
                        <span className="text-xs font-bold" style={{ color: 'oklch(72% 0.14 62)' }}>#{group.numeroPedido}</span>
                        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{tableLabel}</span>
                        <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                      </div>
                      <div className="flex flex-col gap-2">{group.items.map(renderItemCard)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Retenidos — grouped by mesa */}
          {retenidoItems.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 px-1 py-2">
                <TimerOff className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} />
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_DIM }}>
                  {t('waiterRetenidos', lang)} ({retenidoItems.length})
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {Array.from(groupByMesa(retenidoItems).entries()).map(([mesaKey, group]) => {
                  const elapsed = getElapsedMinutes(group.firstCreatedAt);
                  return (
                    <div key={mesaKey}>
                      <div className="flex items-center gap-2 px-1 mb-1.5">
                        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{mesaKey}</span>
                        <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                      </div>
                      <div className="flex flex-col gap-2">{group.items.map(renderItemCard)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>)}

        {groupBy === 'mesa' && hasAny && (
          <div className="flex flex-col gap-5">
            {Array.from(groupByMesa(items).entries()).map(([mesaKey, group]) => {
              const sorted = [...group.items].sort((a, b) => {
                const diff = getKitchenSortOrder(a.estado) - getKitchenSortOrder(b.estado);
                if (diff !== 0) return diff;
                const nameComp = a.nombre.localeCompare(b.nombre);
                return nameComp === 0 ? a.createdAt.localeCompare(b.createdAt) : nameComp;
              });
              const listosInMesa    = group.items.filter(i => i.estado === 'listo');
              const retenidosInMesa = group.items.filter(i => i.estado === 'retenido');
              const isServing       = servingMesas.has(mesaKey);
              const isLiberating    = liberatingMesas.has(mesaKey);
              const isCollapsed     = collapsedMesas.has(mesaKey);
              const isGrouped       = groupedMesas.has(mesaKey);
              const mergedItems     = isGrouped ? groupKitchenMesaItems(sorted) : null;
              const displayLabel    = mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey;
              return (
                <div
                  key={mesaKey}
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}
                >
                  <div
                    className="flex items-center"
                    style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}
                  >
                    <button
                      className="flex flex-1 items-center gap-2 px-3 py-2.5 min-w-0"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      onClick={() => toggleMesaCollapse(mesaKey)}
                    >
                      <Table2 className="w-4 h-4 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
                      <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{displayLabel}</span>
                      <ChevronDown
                        className="w-4 h-4 shrink-0 ml-auto"
                        style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                      />
                    </button>
                    <div className="flex items-center gap-2 pr-3 shrink-0">
                      {listosInMesa.length > 0 && (
                        <button
                          onClick={() => void handleTodosServidos(mesaKey, listosInMesa)}
                          disabled={isServing}
                          title={t('kitchenTodosServidos', lang)}
                          className="flex items-center justify-center rounded-lg disabled:opacity-50"
                          style={{ width: 44, height: 32, background: 'oklch(26% 0.16 148)', color: 'oklch(80% 0.22 148)', border: '1px solid oklch(45% 0.22 148 / 0.6)' }}
                        >
                          {isServing ? <span className="text-[10px]">…</span> : <CheckCheck className="w-4 h-4" />}
                        </button>
                      )}
                      {retenidosInMesa.length > 0 && (
                        <button
                          onClick={() => void handleLiberarRetenidosMesa(mesaKey, retenidosInMesa)}
                          disabled={isLiberating}
                          title={t('kitchenLiberarPedidos', lang)}
                          className="flex items-center justify-center rounded-lg disabled:opacity-50"
                          style={{ width: 44, height: 32, background: 'oklch(21% 0.10 65)', color: 'oklch(72% 0.18 65)', border: '1px solid oklch(50% 0.22 65 / 0.55)' }}
                        >
                          {isLiberating ? <span className="text-[10px]">…</span> : <PlayCircle className="w-4 h-4" />}
                        </button>
                      )}
                      <button
                        onClick={() => setGroupedMesas(prev => {
                          const next = new Set(prev);
                          if (next.has(mesaKey)) next.delete(mesaKey); else next.add(mesaKey);
                          return next;
                        })}
                        title="Agrupar ítems"
                        className="flex items-center justify-center rounded-lg"
                        style={{
                          width: 44, height: 32,
                          background: isGrouped ? 'oklch(28% 0.16 228)' : 'oklch(20% 0.04 252)',
                          color: isGrouped ? 'oklch(78% 0.20 228)' : TEXT_DIM,
                          border: isGrouped ? '1px solid oklch(50% 0.22 228 / 0.6)' : '1px solid oklch(35% 0.06 252 / 0.5)',
                        }}
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-2 p-2">
                      {isGrouped && mergedItems
                        ? mergedItems.map(renderMergedCard)
                        : sorted.map(renderItemCard)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {groupBy === 'listos' && (
          <div className="mb-4">
            {listosItems.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
                {t('kitchenEmpty', lang)}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {Array.from(groupByMesa(listosItems).entries()).map(([mesaKey, group]) => {
                  const isServing    = servingMesas.has(mesaKey);
                  const isCollapsed  = collapsedMesas.has(mesaKey);
                  const displayLabel = mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey;
                  return (
                    <div
                      key={mesaKey}
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}
                    >
                      <div
                        className="flex items-center"
                        style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}
                      >
                        <button
                          className="flex flex-1 items-center gap-2 px-3 py-2.5 min-w-0"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onClick={() => toggleMesaCollapse(mesaKey)}
                        >
                          <Table2 className="w-4 h-4 shrink-0" style={{ color: 'oklch(65% 0.18 148)' }} />
                          <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{displayLabel}</span>
                          <ChevronDown
                            className="w-4 h-4 shrink-0 ml-auto"
                            style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                          />
                        </button>
                        <div className="flex items-center gap-2 pr-3 shrink-0">
                          <button
                            onClick={() => void handleTodosServidos(mesaKey, group.items)}
                            disabled={isServing}
                            title={t('kitchenTodosServidos', lang)}
                            className="flex items-center justify-center rounded-lg disabled:opacity-50"
                            style={{ width: 44, height: 32, background: 'oklch(26% 0.16 148)', color: 'oklch(80% 0.22 148)', border: '1px solid oklch(45% 0.22 148 / 0.6)' }}
                          >
                            {isServing ? <span className="text-[10px]">…</span> : <CheckCheck className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div className="flex flex-col gap-2 p-2">
                          {group.items.map(renderItemCard)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {groupBy === 'retenidos' && (
          <div className="mb-4">
            {retenidoItems.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
                {t('kitchenEmpty', lang)}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {Array.from(groupByMesa(retenidoItems).entries()).map(([mesaKey, group]) => {
                  const isLiberating = liberatingMesas.has(mesaKey);
                  const isCollapsed  = collapsedMesas.has(mesaKey);
                  return (
                    <div
                      key={mesaKey}
                      id={`mesa-section-${mesaKey}`}
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}
                    >
                      <div
                        className="flex items-center"
                        style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}
                      >
                        <button
                          className="flex flex-1 items-center gap-2 px-3 py-2 min-w-0"
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onClick={() => toggleMesaCollapse(mesaKey)}
                        >
                          <Table2 className="w-4 h-4 shrink-0" style={{ color: TEXT_DIM }} />
                          <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                            {mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey}
                          </span>
                          <ChevronDown
                            className="w-4 h-4 shrink-0 ml-auto"
                            style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                          />
                        </button>
                        <div className="flex items-center gap-2 pr-3 shrink-0">
                          <button
                            onClick={() => void handleLiberarRetenidosMesa(mesaKey, group.items)}
                            disabled={isLiberating}
                            title={t('kitchenLiberarPedidos', lang)}
                            className="flex items-center justify-center rounded-lg disabled:opacity-50"
                            style={{ width: 44, height: 32, background: 'oklch(21% 0.10 65)', color: 'oklch(72% 0.18 65)', border: '1px solid oklch(50% 0.22 65 / 0.55)' }}
                          >
                            {isLiberating ? <span className="text-[10px]">…</span> : <PlayCircle className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      {!isCollapsed && (
                        <div className="flex flex-col gap-2 p-2">
                          {group.items.map(renderItemCard)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      {/* Retain confirmation dialog */}
      {pendingRetain && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'oklch(0% 0 0 / 0.65)' }}
        >
          <button
            type="button"
            className="absolute inset-0"
            style={{ cursor: 'default' }}
            aria-label="Close"
            onClick={() => setPendingRetain(null)}
            onKeyDown={e => { if (e.key === 'Escape') { setPendingRetain(null); } }}
          />
          <dialog
            open
            className="w-full max-w-xs rounded-2xl flex flex-col gap-4"
            style={{ background: 'oklch(18% 0.03 252)', border: '1px solid oklch(42% 0.10 252 / 0.5)', margin: 0, padding: '1.25rem' }}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                {t('kitchenRetainConfirmTitle', lang)}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: TEXT_DIM }}>
                {t('kitchenRetainConfirmMsg', lang)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingRetain(null)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: 'oklch(22% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
              >
                {t('kitchenCountdownCancel', lang)}
              </button>
              <button
                onClick={() => void confirmRetain()}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: 'oklch(26% 0.16 35)', color: 'oklch(82% 0.22 35)', border: '1px solid oklch(50% 0.28 35 / 0.6)' }}
              >
                {t('kitchenRetainConfirmYes', lang)}
              </button>
            </div>
          </dialog>
        </div>
      )}
      {/* Cancel confirmation dialog */}
      {pendingCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'oklch(0% 0 0 / 0.72)' }}
        >
          <button
            type="button"
            className="absolute inset-0"
            style={{ cursor: 'default' }}
            aria-label="Close"
            onClick={() => setPendingCancel(null)}
            onKeyDown={e => { if (e.key === 'Escape') { setPendingCancel(null); } }}
          />
          <dialog
            open
            className="w-full max-w-xs rounded-2xl flex flex-col gap-4"
            style={{ background: 'oklch(16% 0.04 25)', border: '1px solid oklch(45% 0.24 25 / 0.5)', margin: 0, padding: '1.25rem' }}
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full" style={{ background: 'oklch(22% 0.20 25)', border: '1px solid oklch(45% 0.28 25 / 0.6)' }}>
                <Trash2 className="w-4 h-4" style={{ color: 'oklch(78% 0.24 25)' }} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                  {t('kitchenCancelConfirmTitle', lang)}
                </span>
                <span className="text-xs font-semibold" style={{ color: 'oklch(72% 0.14 62)' }}>
                  {pendingCancel.reduce((s, i) => s + i.cantidad, 0)}× {pendingCancel[0].nombre}
                </span>
                <span className="text-xs leading-relaxed mt-0.5" style={{ color: TEXT_DIM }}>
                  {t('kitchenCancelConfirmMsg', lang)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingCancel(null)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: 'oklch(20% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
              >
                {t('kitchenCountdownCancel', lang)}
              </button>
              <button
                onClick={() => void confirmCancel()}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: 'oklch(28% 0.24 25)', color: 'oklch(82% 0.24 25)', border: '1px solid oklch(50% 0.30 25 / 0.6)' }}
              >
                <Trash2 className="w-3 h-3" />
                {t('kitchenCancelConfirmYes', lang)}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {/* Merged-group action confirmation dialog */}
      {pendingMergedWaiterAction && (() => {
        let dialogTitle: string;
        if (pendingMergedWaiterAction.action === 'retenido') {
          dialogTitle = t('kitchenItemRetenido', lang);
        } else if (pendingMergedWaiterAction.action === 'servido') {
          dialogTitle = t('kitchenSwipeToServe', lang);
        } else {
          dialogTitle = t('orderStatusPending', lang);
        }
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: 'oklch(0% 0 0 / 0.72)' }}
          >
            <button
              type="button"
              className="absolute inset-0"
              style={{ cursor: 'default' }}
              aria-label="Close"
              onClick={() => setPendingMergedWaiterAction(null)}
              onKeyDown={e => { if (e.key === 'Escape') { setPendingMergedWaiterAction(null); } }}
            />
            <dialog
              open
              className="w-full max-w-xs rounded-2xl flex flex-col gap-4"
              style={{ background: 'oklch(16% 0.04 252)', border: '1px solid oklch(45% 0.12 252 / 0.5)', margin: 0, padding: '1.25rem' }}
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                  {dialogTitle}
                </span>
                <span className="text-xs leading-relaxed" style={{ color: TEXT_DIM }}>
                  {pendingMergedWaiterAction.items.length} {pendingMergedWaiterAction.items.length === 1 ? 'pedido' : 'pedidos'} se procesarán a la vez.
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingMergedWaiterAction(null)}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: 'oklch(20% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
                >
                  {t('kitchenCountdownCancel', lang)}
                </button>
                <button
                  onClick={() => void confirmMergedWaiterAction()}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                  style={{ background: 'oklch(26% 0.14 252)', color: TEXT_MAIN, border: '1px solid oklch(50% 0.14 252 / 0.6)' }}
                >
                  {t('kitchenConfirmProcess', lang)}
                </button>
              </div>
            </dialog>
          </div>
        );
      })()}
    </div>
  );
}
