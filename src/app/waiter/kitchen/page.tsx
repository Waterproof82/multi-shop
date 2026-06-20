'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft, ChevronDown, ChevronsUpDown, TimerOff, CheckCheck, PlayCircle, Pause, Table2 } from 'lucide-react';
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
  return TIME_COLORS[TIME_COLORS.length - 1];
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

function makeKey(pedidoId: string, itemIdx: number) {
  return `${pedidoId}:${itemIdx}`;
}

export default function WaiterKitchenPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
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
  const [collapsedMesas, setCollapsedMesas] = useState<Set<string>>(new Set());
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
    const poll = setInterval(fetchItems, 3000);
    return () => clearInterval(poll);
  }, [fetchItems]);

  useEffect(() => {
    const tick = setInterval(() => setItems(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // Scroll to target mesa when arriving from grid with a mesa param
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!targetMesa || scrolledRef.current || items.length === 0) return;
    scrolledRef.current = true;
    const id = `mesa-section-${targetMesa}`;
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [items, targetMesa]);

  // ── PATCH helper ───────────────────────────────────────────────────────────

  const patchEstado = useCallback(async (pedidoId: string, itemIdx: number, estado: ItemEstado, onSuccess: () => void) => {
    const r = await fetch(`/api/waiter/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    if (r.ok) onSuccess();
  }, []);

  // ── Swipe handlers ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, key: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    swipingKey.current = key;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, key: string) => {
    if (swipingKey.current !== key || pointerStartX.current === null) return;
    const delta   = e.clientX - pointerStartX.current;
    const el      = e.currentTarget as HTMLElement;
    const content = el.querySelector<HTMLElement>('[data-card-content]');
    const bg      = el.querySelector<HTMLElement>('[data-reveal-bg]');
    const hint    = el.querySelector<HTMLElement>('[data-hint]');

    // Only inner content translates — reveal-bg stays stationary, no badge overlap
    if (content) { content.style.transform = `translateX(${delta}px)`; content.style.transition = 'none'; }
    // Reveal colour only on left drag — read from data attribute set per card
    const actionBg = el.dataset.actionColor ?? 'oklch(28% 0.16 148)';
    if (bg) bg.style.background = delta < -20 ? actionBg : 'transparent';
    // Hint only for left drag — it lives in the reveal-bg on the right, never overlaps badge
    if (hint) hint.style.opacity = delta < 0 ? String(Math.min(1, -delta / THRESHOLD)) : '0';
  }, []);

  const snapBack = useCallback((el: HTMLElement) => {
    const content = el.querySelector<HTMLElement>('[data-card-content]');
    const bg      = el.querySelector<HTMLElement>('[data-reveal-bg]');
    const hint    = el.querySelector<HTMLElement>('[data-hint]');
    if (content) { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
    if (bg)   bg.style.background = 'transparent';
    if (hint) hint.style.opacity  = '0';
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, item: KitchenItem) => {
    const key = makeKey(item.pedidoId, item.itemIdx);
    if (swipingKey.current !== key || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingKey.current    = null;

    if (Math.abs(delta) < THRESHOLD) { snapBack(el); return; }

    const isNuevo    = item.estado === 'pendiente' || item.estado === 'en_preparacion';
    const isListo    = item.estado === 'listo';
    const isRetenido = item.estado === 'retenido';

    const resetInner = () => {
      const content = el.querySelector<HTMLElement>('[data-card-content]');
      const bg      = el.querySelector<HTMLElement>('[data-reveal-bg]');
      const hint    = el.querySelector<HTMLElement>('[data-hint]');
      if (content) { content.style.transition = 'none'; content.style.transform = 'translateX(0)'; }
      if (bg)   bg.style.background = 'transparent';
      if (hint) hint.style.opacity  = '0';
    };

    if (isNuevo && delta < 0) {
      if (item.estado === 'en_preparacion') {
        // Item already being prepared — ask for confirmation before retaining
        snapBack(el);
        setPendingRetain(item);
      } else {
        // Pendiente — retain immediately
        // In mesa view: snap back so the card stays visible with retenido styling
        // (same key = same DOM node; flying it off-screen would hide it until next poll)
        // In order view: fly the card out (item moves to a different section = fresh DOM node)
        if (groupBy === 'mesa') {
          snapBack(el);
        } else {
          resetInner();
          el.style.transition = 'transform 0.18s ease';
          el.style.transform  = 'translateX(-110%)';
        }
        void patchEstado(item.pedidoId, item.itemIdx, 'retenido', () => {
          setItems(prev => prev.map(i =>
            i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx ? { ...i, estado: 'retenido' } : i
          ));
        });
      }
    } else if (isListo && delta < 0) {
      // Left swipe on listo → servido: snap inner content, fly outer card left
      resetInner();
      el.style.transition = 'transform 0.18s ease';
      el.style.transform  = 'translateX(-110%)';
      void patchEstado(item.pedidoId, item.itemIdx, 'servido', () => {
        setItems(prev => prev.filter(i => !(i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx)));
      });
    } else if (isRetenido && delta < 0) {
      // Left swipe on retenido → restore to pendiente
      snapBack(el);
      void patchEstado(item.pedidoId, item.itemIdx, 'pendiente', () => {
        setItems(prev => prev.map(i =>
          i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx ? { ...i, estado: 'pendiente' } : i
        ));
      });
    } else {
      snapBack(el);
    }
  }, [patchEstado, snapBack, groupBy, setPendingRetain]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    snapBack(e.currentTarget as HTMLElement);
    pointerStartX.current = null;
    swipingKey.current    = null;
  }, [snapBack]);

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
      setItems(prev => prev.filter(i => !listosInMesa.some(l => l.pedidoId === i.pedidoId && l.itemIdx === i.itemIdx)));
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
      setItems(prev => prev.map(i =>
        retenidos.some(r => r.pedidoId === i.pedidoId && r.itemIdx === i.itemIdx)
          ? { ...i, estado: 'pendiente' }
          : i
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
    await patchEstado(item.pedidoId, item.itemIdx, 'retenido', () => {
      setItems(prev => prev.map(i =>
        i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx ? { ...i, estado: 'retenido' } : i
      ));
    });
  }, [pendingRetain, patchEstado]);

  function renderItemCard(item: KitchenItem) {
    const key        = makeKey(item.pedidoId, item.itemIdx);
    const isEnPrep   = item.estado === 'en_preparacion';
    const isListo    = item.estado === 'listo';
    const isRetenido = item.estado === 'retenido';
    const canSwipe   = true;
    const elapsed = getElapsedMinutes(item.createdAt);

    const baseTimeColor = getTimeColor(elapsed);
    const cardColor: { bg: string; border: string } = isListo    ? LISTO_COLOR
      : isRetenido ? RETENIDO_COLOR
      : baseTimeColor;

    const hintText = isListo
      ? t('kitchenSwipeToServe', lang)
      : isRetenido
        ? t('kitchenSwipeRestore', lang)
        : t('kitchenSwipeToRetenido', lang);

    return (
      <div
        key={key}
        className="relative rounded-xl overflow-hidden select-none"
        data-action-color={isRetenido ? 'oklch(28% 0.12 65)' : 'oklch(28% 0.16 148)'}
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
        {canSwipe && (
          /* Reveal background — stationary; hint on RIGHT (visible during left drag) */
          <div data-reveal-bg="" className="absolute inset-0 flex items-center justify-end px-3" style={{ background: 'transparent' }}>
            <span
              data-hint=""
              className="pointer-events-none text-[10px] font-bold"
              style={{ opacity: 0, color: isRetenido ? 'oklch(75% 0.20 65)' : isListo ? 'oklch(75% 0.18 148)' : 'oklch(68% 0.22 148)', transition: 'opacity 0.1s' }}
            >
              {hintText}
            </span>
          </div>
        )}

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
              style={isListo ? {
                background: 'oklch(28% 0.16 148 / 0.5)',
                color:      'oklch(80% 0.22 148)',
              } : isEnPrep ? {
                background: 'oklch(32% 0.16 90 / 0.5)',
                color:      'oklch(82% 0.20 90)',
              } : isRetenido ? {
                background: 'oklch(28% 0.14 65 / 0.5)',
                color:      'oklch(78% 0.20 65)',
              } : {
                background: 'oklch(30% 0.10 252 / 0.4)',
                color:      'oklch(75% 0.12 252)',
              }}
            >
              {isRetenido && <Pause className="w-2.5 h-2.5" />}
              {isListo
                ? t('kitchenItemListo', lang)
                : isRetenido
                  ? t('kitchenItemRetenido', lang)
                  : isEnPrep
                    ? t('orderStatusAnotado', lang)
                    : t('orderStatusPending', lang)}
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
          {TIME_COLORS.map((c, idx) => (
            <span
              key={idx}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            >
              {c.label}
            </span>
          ))}
        </div>
        {/* Row 3: filter toggle */}
        <div className="flex items-center gap-1 px-3 pb-2 flex-wrap">
          {(['order', 'mesa', 'listos', 'retenidos'] as const).map(mode => {
            const isActive = groupBy === mode;
            const isListos    = mode === 'listos';
            const isRetenidos = mode === 'retenidos';
            const label = mode === 'order'     ? t('kitchenGroupByOrder', lang)
              : mode === 'mesa'      ? t('kitchenGroupByTable', lang)
              : mode === 'listos'    ? t('kitchenListos', lang)
              : t('waiterRetenidos', lang);
            const activeStyle = isListos ? {
              background: 'oklch(26% 0.16 148)',
              color: 'oklch(80% 0.22 148)',
              border: '1px solid oklch(52% 0.26 148 / 0.7)',
            } : isRetenidos ? {
              background: 'oklch(24% 0.06 252)',
              color: TEXT_DIM,
              border: '1px solid oklch(48% 0.08 252 / 0.6)',
            } : {
              background: 'oklch(32% 0.10 252)',
              color: TEXT_MAIN,
              border: '1px solid oklch(50% 0.10 252 / 0.6)',
            };
            return (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className="rounded px-3 py-1 text-[11px] font-semibold transition-colors"
                style={isActive ? activeStyle : {
                  background: 'transparent',
                  color: TEXT_DIM,
                  border: '1px solid oklch(35% 0.06 252 / 0.4)',
                }}
              >
                {label}
              </button>
            );
          })}
          {groupBy !== 'order' && (() => {
            const mesaKeys = Array.from(groupByMesa(
                  groupBy === 'listos' ? listosItems : groupBy === 'retenidos' ? retenidoItems : items
                ).keys());
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
              const elapsed = getElapsedMinutes(group.firstCreatedAt);
              const sorted = [...group.items].sort((a, b) => {
                const order = (i: KitchenItem) => i.estado === 'listo' ? 0 : i.estado === 'retenido' ? 2 : 1;
                const diff = order(a) - order(b);
                return diff !== 0 ? diff : a.createdAt.localeCompare(b.createdAt);
              });
              const listosInMesa    = group.items.filter(i => i.estado === 'listo');
              const retenidosInMesa = group.items.filter(i => i.estado === 'retenido');
              const isServing       = servingMesas.has(mesaKey);
              const isLiberating    = liberatingMesas.has(mesaKey);
              const isCollapsed     = collapsedMesas.has(mesaKey);
              const displayLabel    = mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey;
              return (
                <div
                  key={mesaKey}
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}
                >
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}
                    onClick={() => toggleMesaCollapse(mesaKey)}
                  >
                    <Table2 className="w-4 h-4 shrink-0" style={{ color: 'oklch(62% 0.14 62)' }} />
                    <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{displayLabel}</span>
                    <div className="flex items-center gap-2 ml-auto" onClick={e => e.stopPropagation()}>
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
                    </div>
                    <ChevronDown
                      className="w-4 h-4 shrink-0"
                      style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                    />
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col gap-2 p-2">
                      {sorted.map(renderItemCard)}
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
                  const isServing      = servingMesas.has(mesaKey);
                  const isCollapsed    = collapsedMesas.has(mesaKey);
                  const displayLabel   = mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey;
                  return (
                    <div
                      key={mesaKey}
                      className="rounded-xl overflow-hidden"
                      style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}
                    >
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                        style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}
                        onClick={() => toggleMesaCollapse(mesaKey)}
                      >
                        <Table2 className="w-4 h-4 shrink-0" style={{ color: 'oklch(65% 0.18 148)' }} />
                        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{displayLabel}</span>
                        <div className="flex items-center gap-2 ml-auto" onClick={e => e.stopPropagation()}>
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
                        <ChevronDown
                          className="w-4 h-4 shrink-0"
                          style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                        />
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
                        className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                        style={{ background: 'oklch(18% 0.03 252)', borderBottom: isCollapsed ? 'none' : '1px solid oklch(35% 0.08 252 / 0.4)' }}
                        onClick={() => toggleMesaCollapse(mesaKey)}
                      >
                        <Table2 className="w-4 h-4 shrink-0" style={{ color: TEXT_DIM }} />
                        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                          {mesaKey.startsWith('Mesa ') ? mesaKey.slice(5) : mesaKey}
                        </span>
                        <div className="flex items-center gap-2 ml-auto" onClick={e => e.stopPropagation()}>
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
                        <ChevronDown
                          className="w-4 h-4 shrink-0"
                          style={{ color: TEXT_DIM, transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
                        />
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
          onClick={() => setPendingRetain(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'oklch(18% 0.03 252)', border: '1px solid oklch(42% 0.10 252 / 0.5)' }}
            onClick={e => e.stopPropagation()}
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
          </div>
        </div>
      )}
    </div>
  );
}
