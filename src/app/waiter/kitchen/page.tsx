'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft, TimerOff } from 'lucide-react';
import type { ItemEstado } from '@/core/domain/repositories/IPedidoRepository';

interface KitchenItem {
  pedidoId: string;
  numeroPedido: number;
  itemIdx: number;
  nombre: string;
  cantidad: number;
  complementos?: string;
  estado: ItemEstado;
  mesaNumero: number | null;
  mesaNombre: string | null;
  createdAt: string;
  isDiferido?: boolean;
}

const BG        = 'oklch(13% 0.02 252)';
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

// Time-based colors for "nuevo" items (pendiente / en_preparacion)
const TIME_COLORS = [
  { max: 10,       label: '<10 min',  bg: 'oklch(20% 0.06 240)', border: 'oklch(42% 0.12 240 / 0.45)', text: 'oklch(60% 0.08 240)' },
  { max: 20,       label: '10 min',   bg: 'oklch(28% 0.18 85)',  border: 'oklch(58% 0.26 85  / 0.55)', text: 'oklch(75% 0.18 85)'  },
  { max: 30,       label: '20 min',   bg: 'oklch(27% 0.15 60)',  border: 'oklch(56% 0.26 60  / 0.55)', text: 'oklch(75% 0.20 60)'  },
  { max: 45,       label: '30 min',   bg: 'oklch(26% 0.17 38)',  border: 'oklch(56% 0.29 38  / 0.55)', text: 'oklch(75% 0.22 38)'  },
  { max: 60,       label: '45 min',   bg: 'oklch(24% 0.18 22)',  border: 'oklch(54% 0.31 22  / 0.55)', text: 'oklch(73% 0.24 22)'  },
  { max: Infinity, label: '60+ min',  bg: 'oklch(22% 0.20 12)',  border: 'oklch(52% 0.34 12  / 0.65)', text: 'oklch(70% 0.26 12)'  },
];

const EN_PREP_COLOR  = { bg: 'oklch(28% 0.22 90)',  border: 'oklch(62% 0.30 90  / 0.65)' };
const LISTO_COLOR    = { bg: 'oklch(22% 0.18 148)', border: 'oklch(52% 0.26 148 / 0.65)' };
const RETENIDO_COLOR = { bg: 'oklch(20% 0.05 252)', border: 'oklch(38% 0.08 252 / 0.35)' };

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

function makeKey(pedidoId: string, itemIdx: number) {
  return `${pedidoId}:${itemIdx}`;
}

export default function WaiterKitchenPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [items, setItems] = useState<KitchenItem[]>([]);
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
    // Reveal colour only on left drag (the actionable direction)
    if (bg) bg.style.background = delta < -20 ? 'oklch(28% 0.16 148)' : 'transparent';
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
      // Left swipe on nuevo → retenido: snap inner content, fly outer card left
      resetInner();
      el.style.transition = 'transform 0.18s ease';
      el.style.transform  = 'translateX(-110%)';
      void patchEstado(item.pedidoId, item.itemIdx, 'retenido', () => {
        setItems(prev => prev.map(i =>
          i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx ? { ...i, estado: 'retenido' } : i
        ));
      });
    } else if (isListo && delta < 0) {
      // Left swipe on listo → servido: snap inner content, fly outer card left
      resetInner();
      el.style.transition = 'transform 0.18s ease';
      el.style.transform  = 'translateX(-110%)';
      void patchEstado(item.pedidoId, item.itemIdx, 'servido', () => {
        setItems(prev => prev.filter(i => !(i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx)));
      });
    } else if (isRetenido && !item.isDiferido && delta < 0) {
      // Left swipe on waiter-retenido → restore to pendiente (not for diferido cart items)
      snapBack(el);
      void patchEstado(item.pedidoId, item.itemIdx, 'pendiente', () => {
        setItems(prev => prev.map(i =>
          i.pedidoId === item.pedidoId && i.itemIdx === item.itemIdx ? { ...i, estado: 'pendiente' } : i
        ));
      });
    } else {
      snapBack(el);
    }
  }, [patchEstado, snapBack]);

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

  function renderItemCard(item: KitchenItem) {
    const key        = item.isDiferido ? `dif-${item.pedidoId}-${item.itemIdx}` : makeKey(item.pedidoId, item.itemIdx);
    const isEnPrep   = item.estado === 'en_preparacion';
    const isListo    = item.estado === 'listo';
    const isRetenido = item.estado === 'retenido';
    const canSwipe   = !item.isDiferido;
    const elapsed = getElapsedMinutes(item.createdAt);

    const baseTimeColor = getTimeColor(elapsed);
    const cardColor: { bg: string; border: string } = isEnPrep    ? EN_PREP_COLOR
      : isListo    ? LISTO_COLOR
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
        style={{
          background:  cardColor.bg,
          border:      `1px solid ${cardColor.border}`,
          touchAction: 'pan-y',
          willChange:  'transform',
        }}
        onPointerDown={canSwipe ? e => handlePointerDown(e, key) : undefined}
        onPointerMove={canSwipe ? e => handlePointerMove(e, key) : undefined}
        onPointerUp={canSwipe ? e => handlePointerUp(e, item) : undefined}
        onPointerCancel={canSwipe ? handlePointerCancel : undefined}
      >
        {canSwipe && (
          /* Reveal background — stationary; hint on RIGHT (visible during left drag) */
          <div data-reveal-bg="" className="absolute inset-0 flex items-center justify-end px-3" style={{ background: 'transparent' }}>
            <span
              data-hint=""
              className="pointer-events-none text-[10px] font-bold"
              style={{ opacity: 0, color: isListo ? 'oklch(75% 0.18 148)' : isRetenido ? 'oklch(68% 0.16 148)' : 'oklch(68% 0.22 148)', transition: 'opacity 0.1s' }}
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
                <span className="text-[10px]" style={{ color: TEXT_DIM }}>({item.complementos})</span>
              </div>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={isListo ? {
                background: 'oklch(28% 0.16 148 / 0.5)',
                color:      'oklch(80% 0.22 148)',
              } : isEnPrep ? {
                background: 'oklch(32% 0.16 90 / 0.5)',
                color:      'oklch(82% 0.20 90)',
              } : isRetenido ? {
                background: 'oklch(28% 0.08 252 / 0.5)',
                color:      TEXT_DIM,
              } : {
                background: 'oklch(30% 0.10 252 / 0.4)',
                color:      'oklch(75% 0.12 252)',
              }}
            >
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
        className="fixed top-0 left-0 right-0 z-10 flex h-12 items-center gap-3 px-4 shadow-lg"
        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(42% 0.14 62 / 0.35)' }}
      >
        <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
          <ChevronLeft className="w-4 h-4" />
          {t('waiterLogout', lang)}
        </a>
        <UtensilsCrossed className="w-4 h-4" style={{ color: 'oklch(72% 0.14 62)' }} />
        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{t('kitchenTitle', lang)}</span>
        <span className="text-[10px]" style={{ color: TEXT_DIM }}>({nuevosItems.length + listosItems.length})</span>
      </div>

      <div className="pt-12 px-3 pb-6">
        {/* Time legend */}
        <div className="flex flex-wrap gap-1.5 py-3 px-1">
          {TIME_COLORS.map((c, idx) => (
            <span
              key={idx}
              className="rounded px-2 py-0.5 text-[10px] font-medium"
              style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
            >
              {c.label}
            </span>
          ))}
        </div>

        {!hasAny && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('kitchenEmpty', lang)}
          </div>
        )}

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
                      <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>#{group.numeroPedido}</span>
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
                      <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>#{group.numeroPedido}</span>
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

        {/* Retenidos */}
        {retenidoItems.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-1 py-2">
              <TimerOff className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_DIM }}>
                {t('waiterRetenidos', lang)} ({retenidoItems.length})
              </span>
            </div>
            <div className="flex flex-col gap-4">
              {Array.from(groupByPedido(retenidoItems).entries()).map(([pedidoId, group]) => {
                const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
                const elapsed    = getElapsedMinutes(group.createdAt);
                const hasOrder   = group.items.some(i => !i.isDiferido);
                return (
                  <div key={pedidoId}>
                    <div className="flex items-center gap-2 px-1 mb-1.5">
                      {hasOrder && <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>#{group.numeroPedido}</span>}
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
      </div>
    </div>
  );
}
