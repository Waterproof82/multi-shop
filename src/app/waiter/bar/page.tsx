'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { Wine, ChevronLeft, Clock, TimerOff } from 'lucide-react';

interface BarOrder {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
  tipo: 'bebida' | 'bebida-info' | 'kitchen-alert';
}

interface RetenidoItem {
  itemId: string;
  nombre: string;
  cantidad: number;
  complementos?: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  sesionCreatedAt: string;
}

const BG = "oklch(13% 0.02 252)";
const TEXT_MAIN = "oklch(92% 0.02 252)";
const TEXT_DIM = "oklch(55% 0.04 252)";

const TIME_COLORS: { max: number; label: string; bg: string; border: string; text: string }[] = [
  { max: 10,       label: '<10 min', bg: 'oklch(22% 0.03 252)', border: 'oklch(40% 0.05 252 / 0.4)', text: 'oklch(60% 0.03 252)' },
  { max: 20,       label: '10 min',  bg: 'oklch(25% 0.10 85)',  border: 'oklch(55% 0.20 85 / 0.5)',  text: 'oklch(75% 0.18 85)'  },
  { max: 30,       label: '20 min',  bg: 'oklch(25% 0.12 65)',  border: 'oklch(55% 0.25 65 / 0.5)',  text: 'oklch(75% 0.20 65)'  },
  { max: 45,       label: '30 min',  bg: 'oklch(25% 0.14 40)',  border: 'oklch(55% 0.28 40 / 0.5)',  text: 'oklch(75% 0.22 40)'  },
  { max: 60,       label: '45 min',  bg: 'oklch(25% 0.16 25)',  border: 'oklch(55% 0.30 25 / 0.5)',  text: 'oklch(75% 0.24 25)'  },
  { max: Infinity, label: '60+ min', bg: 'oklch(22% 0.18 15)',  border: 'oklch(50% 0.32 15 / 0.6)',  text: 'oklch(72% 0.26 15)'  },
];

const KITCHEN_ALERT_BG     = 'oklch(22% 0.10 148)';
const KITCHEN_ALERT_BORDER = 'oklch(50% 0.22 148 / 0.5)';
const KITCHEN_ALERT_ACCENT = 'oklch(78% 0.20 148)';
const BEBIDA_INFO_BG       = 'oklch(20% 0.05 252)';
const BEBIDA_INFO_BORDER   = 'oklch(38% 0.08 252 / 0.35)';

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
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const SWIPE_THRESHOLD = 80;

export default function BarPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [orders, setOrders] = useState<BarOrder[]>([]);
  const [retenidos, setRetenidos] = useState<RetenidoItem[]>([]);
  const pointerStartX = useRef<number | null>(null);
  const swipingId = useRef<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/bar/orders');
      if (r.ok) {
        const json = await r.json() as { orders: BarOrder[]; retenidos: RetenidoItem[] };
        setOrders(json.orders ?? []);
        setRetenidos(json.retenidos ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchOrders();
    const poll = setInterval(fetchOrders, 3000);
    return () => clearInterval(poll);
  }, [fetchOrders]);

  // Trigger re-render every second so timers update without refetching
  useEffect(() => {
    const tick = setInterval(() => setOrders(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Swipe handlers ────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointerStartX.current = e.clientX;
    swipingId.current = id;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (swipingId.current !== id || pointerStartX.current === null) return;
    const delta = Math.min(0, e.clientX - pointerStartX.current);
    const el = e.currentTarget as HTMLElement;
    el.style.transform = `translateX(${delta}px)`;
    el.style.transition = 'none';
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, order: BarOrder) => {
    if (swipingId.current !== order.id || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingId.current = null;

    if (delta > -SWIPE_THRESHOLD) {
      el.style.transition = 'transform 0.25s ease';
      el.style.transform = 'translateX(0)';
      return;
    }

    el.style.transition = 'transform 0.18s ease';
    el.style.transform = 'translateX(-100%)';

    fetch(`/api/waiter/orders/${encodeURIComponent(order.id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'servido' }),
    }).then(r => {
      if (r.ok) {
        setOrders(prev => prev.filter(o => o.id !== order.id));
      } else {
        el.style.transition = 'transform 0.25s ease';
        el.style.transform = 'translateX(0)';
      }
    }).catch(() => {
      el.style.transition = 'transform 0.25s ease';
      el.style.transform = 'translateX(0)';
    });
  }, []);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.style.transition = 'transform 0.25s ease';
    el.style.transform = 'translateX(0)';
    pointerStartX.current = null;
    swipingId.current = null;
  }, []);

  const swipeableOrders = orders.filter(o => o.tipo !== 'bebida-info');
  const infoOrders      = orders.filter(o => o.tipo === 'bebida-info');
  const hasAnyContent   = swipeableOrders.length > 0 || infoOrders.length > 0 || retenidos.length > 0;

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div
        className="fixed top-0 left-0 right-0 z-10 flex h-12 items-center gap-3 px-4 shadow-lg"
        style={{ background: "oklch(17% 0.025 252)", borderBottom: "1px solid oklch(42% 0.10 252 / 0.35)" }}
      >
        <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
          <ChevronLeft className="w-4 h-4" />
          {t("waiterLogout", lang)}
        </a>
        <Wine className="w-4 h-4" style={{ color: "oklch(68% 0.14 252)" }} />
        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{t("barTitle", lang)}</span>
        <span className="text-[10px]" style={{ color: TEXT_DIM }}>({swipeableOrders.length})</span>
      </div>

      <div className="pt-12 px-3 pb-6">
        {/* Color legend */}
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

        {/* Bebida-info: mixed orders whose comida is still being cooked */}
        {infoOrders.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-1 mb-2">
              <Clock className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_DIM }}>
                {t("barPreparando", lang)} ({infoOrders.length})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {infoOrders.map(order => {
                const elapsed = getElapsedMinutes(order.createdAt);
                const tableLabel = order.mesaNombre ?? `Mesa ${order.mesaNumero ?? '—'}`;
                return (
                  <div
                    key={`info-${order.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: BEBIDA_INFO_BG, border: `1px solid ${BEBIDA_INFO_BORDER}` }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-bold shrink-0" style={{ color: TEXT_DIM }}>#{order.numeroPedido}</span>
                      <span className="text-[10px] shrink-0" style={{ color: TEXT_DIM }}>{tableLabel}</span>
                      <div className="flex flex-wrap gap-x-2 gap-y-0 min-w-0">
                        {order.items.map((item, i) => (
                          <span key={i} className="text-xs" style={{ color: TEXT_MAIN }}>
                            {item.cantidad}× {item.nombre}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono shrink-0 ml-3" style={{ color: TEXT_DIM }}>
                      {formatTimer(elapsed)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Retenidos — deferred items visible only to waiter */}
        {retenidos.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 px-1 mb-2">
              <TimerOff className="w-3.5 h-3.5" style={{ color: TEXT_DIM }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: TEXT_DIM }}>
                {t('waiterRetenidos', lang)} ({retenidos.length})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {retenidos.map((item, idx) => {
                const tableLabel = item.mesaNombre ?? `Mesa ${item.mesaNumero ?? '—'}`;
                const elapsed = getElapsedMinutes(item.sesionCreatedAt);
                return (
                  <div
                    key={`${item.itemId}-${idx}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ background: 'oklch(20% 0.05 252)', border: '1px solid oklch(38% 0.08 252 / 0.35)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-medium shrink-0" style={{ color: TEXT_MAIN }}>{item.cantidad}×</span>
                      <span className="text-xs truncate" style={{ color: TEXT_MAIN }}>{item.nombre || '—'}</span>
                      {item.complementos && (
                        <span className="text-[10px] shrink-0" style={{ color: TEXT_DIM }}>({item.complementos})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2 text-[10px]" style={{ color: TEXT_DIM }}>
                      <span>{tableLabel}</span>
                      <span className="font-mono">{elapsed}m</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Swipeable orders */}
        <div className="flex flex-col gap-3">
          {!hasAnyContent && (
            <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
              {t("barEmpty", lang)}
            </div>
          )}

          {swipeableOrders.map(order => {
            const isAlert = order.tipo === 'kitchen-alert';
            const elapsed = getElapsedMinutes(order.createdAt);
            const timeColor = isAlert ? null : getTimeColor(elapsed);
            const tableLabel = order.mesaNombre ?? `Mesa ${order.mesaNumero ?? '—'}`;

            return (
              <div
                key={`${order.tipo}-${order.id}`}
                className="relative rounded-xl overflow-hidden select-none"
                style={{
                  background: isAlert ? KITCHEN_ALERT_BG : timeColor!.bg,
                  border: `1px solid ${isAlert ? KITCHEN_ALERT_BORDER : timeColor!.border}`,
                  touchAction: 'pan-y',
                  willChange: 'transform',
                }}
                onPointerDown={e => handlePointerDown(e, order.id)}
                onPointerMove={e => handlePointerMove(e, order.id)}
                onPointerUp={e => handlePointerUp(e, order)}
                onPointerCancel={handlePointerCancel}
              >
                {/* Swipe reveal background */}
                <div
                  className="absolute inset-0 flex items-center justify-end pr-5"
                  style={{ background: isAlert ? 'oklch(30% 0.18 148)' : 'oklch(28% 0.16 148)' }}
                >
                  <span className="text-xs font-bold" style={{ color: KITCHEN_ALERT_ACCENT }}>
                    {isAlert ? t("kitchenAlertPickup", lang) : t("orderStatusServido", lang)} ✓
                  </span>
                </div>

                {/* Card */}
                <div className="relative p-3" style={{ background: 'inherit' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>#{order.numeroPedido}</span>
                      <span className="text-xs" style={{ color: TEXT_DIM }}>{tableLabel}</span>
                      {isAlert && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ background: 'oklch(28% 0.16 148)', color: KITCHEN_ALERT_ACCENT }}
                        >
                          {t("kitchenAlertReady", lang)}
                        </span>
                      )}
                    </div>
                    {!isAlert && (
                      <span
                        className="text-xs font-mono font-bold shrink-0"
                        style={{ color: timeColor === TIME_COLORS[0] ? TEXT_DIM : timeColor!.text }}
                      >
                        {formatTimer(elapsed)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="text-xs" style={{ color: TEXT_MAIN }}>
                        <span className="font-medium">{item.cantidad}×</span> {item.nombre}
                      </div>
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
