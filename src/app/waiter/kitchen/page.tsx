'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft } from 'lucide-react';

interface KitchenOrder {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number; complementos?: { nombre?: string; name?: string }[] }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
}

const BG        = 'oklch(13% 0.02 252)';
const CARD_BG_NEUTRAL = 'oklch(20% 0.06 240)'; // cool blue  — not used directly, but referenced for legend
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

// Time-based colors for `pendiente` orders
const TIME_COLORS: { max: number; bg: string; border: string }[] = [
  { max: 10,       bg: 'oklch(20% 0.06 240)',  border: 'oklch(42% 0.12 240 / 0.45)' }, // cool blue  — fresh
  { max: 20,       bg: 'oklch(28% 0.18 85)',   border: 'oklch(58% 0.26 85 / 0.55)'  }, // bright amber
  { max: 30,       bg: 'oklch(27% 0.15 60)',   border: 'oklch(56% 0.26 60 / 0.55)'  }, // orange
  { max: 45,       bg: 'oklch(26% 0.17 38)',   border: 'oklch(56% 0.29 38 / 0.55)'  }, // red-orange
  { max: 60,       bg: 'oklch(24% 0.18 22)',   border: 'oklch(54% 0.31 22 / 0.55)'  }, // red
  { max: Infinity, bg: 'oklch(22% 0.20 12)',   border: 'oklch(52% 0.34 12 / 0.65)'  }, // deep red
];

// Fixed color for `anotado` (En preparación) — state-based, not time-based
const PREP_COLOR = { bg: 'oklch(28% 0.22 90)', border: 'oklch(62% 0.30 90 / 0.65)' };

function getTimeColor(minutes: number) {
  for (const c of TIME_COLORS) {
    if (minutes < c.max) return c;
  }
  return TIME_COLORS[TIME_COLORS.length - 1];
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}min`;
}

const TRANSITIONS: Record<string, string> = { pendiente: 'anotado', anotado: 'preparado' };
const REVERSALS:   Record<string, string> = { anotado: 'pendiente' };
const THRESHOLD = 80;

export default function KitchenPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const pointerStartX = useRef<number | null>(null);
  const swipingId     = useRef<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/kitchen/orders');
      if (r.ok) {
        const json = await r.json() as { orders: KitchenOrder[] };
        setOrders(json.orders);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchOrders();
    const poll = setInterval(fetchOrders, 3000);
    return () => clearInterval(poll);
  }, [fetchOrders]);

  // Tick every second so timers update without refetch
  useEffect(() => {
    const tick = setInterval(() => setOrders(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function resetReveal(el: HTMLElement) {
    const bg = el.querySelector<HTMLElement>('[data-reveal-bg]');
    if (bg) bg.style.background = 'transparent';
    el.querySelector<HTMLElement>('[data-reveal-advance]')?.style.setProperty('display', 'none');
    el.querySelector<HTMLElement>('[data-reveal-revert]')?.style.setProperty('display', 'none');
  }

  function snapBack(el: HTMLElement) {
    el.style.transition = 'transform 0.25s ease';
    el.style.transform  = 'translateX(0)';
    resetReveal(el);
  }

  // ── Swipe handlers ───────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    swipingId.current = id;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (swipingId.current !== id || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    el.style.transform  = `translateX(${delta}px)`;
    el.style.transition = 'none';

    // Update reveal hint based on direction
    const bg      = el.querySelector<HTMLElement>('[data-reveal-bg]');
    const advance = el.querySelector<HTMLElement>('[data-reveal-advance]');
    const revert  = el.querySelector<HTMLElement>('[data-reveal-revert]');

    if (delta > 20) {
      if (bg)      bg.style.background = 'oklch(28% 0.16 148)';
      if (advance) advance.style.display = 'block';
      if (revert)  revert.style.display  = 'none';
    } else if (delta < -20) {
      if (bg)      bg.style.background = 'oklch(26% 0.10 252)';
      if (advance) advance.style.display = 'none';
      if (revert)  revert.style.display  = 'block';
    } else {
      if (bg)      bg.style.background = 'transparent';
      if (advance) advance.style.display = 'none';
      if (revert)  revert.style.display  = 'none';
    }
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, orderId: string, currentEstado: string) => {
    if (swipingId.current !== orderId || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingId.current     = null;

    const snap = () => snapBack(el);

    if (delta > THRESHOLD) {
      // ── Right swipe: advance state ──────────────────────────────────────
      const nextState = TRANSITIONS[currentEstado];
      if (!nextState) { snap(); return; }

      const isFinal = nextState === 'preparado';
      if (isFinal) {
        el.style.transition = 'transform 0.18s ease';
        el.style.transform  = 'translateX(110%)';
      } else {
        snap();
      }

      fetch(`/api/waiter/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nextState }),
      }).then(r => {
        if (r.ok) {
          if (isFinal) {
            setOrders(prev => prev.filter(o => o.id !== orderId));
          } else {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: nextState } : o));
          }
        } else {
          snap();
        }
      }).catch(snap);

    } else if (delta < -THRESHOLD) {
      // ── Left swipe: revert state ─────────────────────────────────────────
      const prevState = REVERSALS[currentEstado];
      if (!prevState) { snap(); return; }

      snap(); // always snap back visually

      fetch(`/api/waiter/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: prevState }),
      }).then(r => {
        if (r.ok) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: prevState } : o));
        }
      }).catch(() => {});

    } else {
      snap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    snapBack(e.currentTarget as HTMLElement);
    pointerStartX.current = null;
    swipingId.current     = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <span className="text-[10px]" style={{ color: TEXT_DIM }}>({orders.length})</span>
      </div>

      <div className="pt-12 px-3 pb-6">
        {/* Color legend */}
        <div className="flex flex-wrap gap-2 py-3 px-1">
          {/* State legend: En preparación */}
          <span
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{ background: PREP_COLOR.bg, color: 'oklch(80% 0.18 90)', border: `1px solid ${PREP_COLOR.border}` }}
          >
            {t('orderStatusAnotado', lang)}
          </span>
          {/* Time legends */}
          {TIME_COLORS.map((c, idx) => (
            <span
              key={idx}
              className="rounded px-2 py-0.5 text-[10px] font-medium"
              style={{ background: c.bg, color: TEXT_DIM, border: `1px solid ${c.border}` }}
            >
              {([ t('colorNeutral', lang), t('colorYellow', lang), t('colorOrange', lang), t('colorRedOrange', lang), t('colorRed', lang), t('colorDeepRed', lang) ] as const)[idx]}
            </span>
          ))}
        </div>

        {/* Orders list */}
        <div className="flex flex-col gap-3">
          {orders.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
              No hay pedidos de cocina activos
            </div>
          )}

          {orders.map(order => {
            const isInPrep  = order.estado === 'anotado';
            const elapsed   = getElapsedMinutes(order.createdAt);
            const cardColor = isInPrep ? PREP_COLOR : getTimeColor(elapsed);
            const tableLabel = order.mesaNombre ?? `Mesa ${order.mesaNumero ?? '—'}`;

            const nextLabel: Record<string, string> = {
              pendiente: t('orderStatusAnotado', lang),
              anotado:   t('orderStatusPreparado', lang),
            };
            const prevLabel: Record<string, string> = {
              anotado: t('orderStatusPending', lang),
            };

            const hasAdvance = order.estado in TRANSITIONS;
            const hasRevert  = order.estado in REVERSALS;

            return (
              <div
                key={order.id}
                className="relative rounded-xl overflow-hidden select-none"
                style={{
                  background:   cardColor.bg,
                  border:       `1px solid ${cardColor.border}`,
                  touchAction:  'pan-y',
                  willChange:   'transform',
                }}
                onPointerDown={e => handlePointerDown(e, order.id)}
                onPointerMove={e => handlePointerMove(e, order.id)}
                onPointerUp={e => handlePointerUp(e, order.id, order.estado)}
                onPointerCancel={handlePointerCancel}
              >
                {/* Reveal background — DOM-updated by swipe handlers */}
                {(hasAdvance || hasRevert) && (
                  <div
                    data-reveal-bg=""
                    className="absolute inset-0"
                    style={{ background: 'transparent' }}
                  >
                    {hasAdvance && (
                      <span
                        data-reveal-advance=""
                        className="absolute left-5 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{ display: 'none', color: 'oklch(75% 0.18 148)' }}
                      >
                        {nextLabel[order.estado]} ✓
                      </span>
                    )}
                    {hasRevert && (
                      <span
                        data-reveal-revert=""
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{ display: 'none', color: 'oklch(75% 0.14 252)' }}
                      >
                        ↩ {prevLabel[order.estado]}
                      </span>
                    )}
                  </div>
                )}

                <div className="relative p-3" style={{ background: 'inherit' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                        #{order.numeroPedido}
                      </span>
                      <span className="text-xs" style={{ color: TEXT_DIM }}>
                        {tableLabel}
                      </span>
                    </div>
                    {!isInPrep && (
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: elapsed < 10 ? TEXT_DIM : 'oklch(92% 0.10 40)' }}
                      >
                        {formatTimer(elapsed)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="text-xs" style={{ color: TEXT_MAIN }}>
                        <span className="font-medium">{item.cantidad}x</span>{' '}
                        {item.nombre || <span style={{ color: TEXT_DIM }}>—</span>}
                        {item.complementos && item.complementos.length > 0 && (
                          <span className="text-[10px]" style={{ color: TEXT_DIM }}>
                            {' '}({item.complementos.map(c => c.nombre ?? c.name).join(', ')})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2">
                    <span
                      className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                      style={isInPrep ? {
                        background: 'oklch(32% 0.16 90 / 0.5)',
                        color:      'oklch(82% 0.20 90)',
                      } : {
                        background: 'oklch(30% 0.10 252 / 0.4)',
                        color:      'oklch(75% 0.12 252)',
                      }}
                    >
                      {order.estado === 'pendiente'
                        ? t('orderStatusPending', lang)
                        : t('orderStatusAnotado', lang)}
                    </span>
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
