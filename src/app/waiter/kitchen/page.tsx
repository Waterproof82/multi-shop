'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft, TimerOff } from 'lucide-react';

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

interface RetenidoItem {
  itemId: string;
  nombre: string;
  cantidad: number;
  complementos?: string;
  mesaNumero: number | null;
  mesaNombre: string | null;
  sesionCreatedAt: string;
}

interface KitchenResponse {
  orders: KitchenOrder[];
  retenidos: RetenidoItem[];
}

const BG = "oklch(13% 0.02 252)";
const CARD_BG = "oklch(18% 0.025 252)";
const CARD_BORDER = "oklch(35% 0.08 252 / 0.3)";
const TEXT_MAIN = "oklch(92% 0.02 252)";
const TEXT_DIM = "oklch(55% 0.04 252)";

const TIME_COLORS: { max: number; bg: string; border: string }[] = [
  { max: 10, bg: 'oklch(22% 0.03 252)', border: 'oklch(40% 0.05 252 / 0.4)' },
  { max: 20, bg: 'oklch(25% 0.10 85)', border: 'oklch(55% 0.20 85 / 0.5)' },
  { max: 30, bg: 'oklch(25% 0.12 65)', border: 'oklch(55% 0.25 65 / 0.5)' },
  { max: 45, bg: 'oklch(25% 0.14 40)', border: 'oklch(55% 0.28 40 / 0.5)' },
  { max: 60, bg: 'oklch(25% 0.16 25)', border: 'oklch(55% 0.30 25 / 0.5)' },
  { max: Infinity, bg: 'oklch(22% 0.18 15)', border: 'oklch(50% 0.32 15 / 0.6)' },
];

function getTimeColor(minutes: number) {
  for (const c of TIME_COLORS) {
    if (minutes < c.max) return c;
  }
  return TIME_COLORS[TIME_COLORS.length - 1];
}

function getElapsedMinutes(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return Math.floor((now - created) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}min`;
}

export default function KitchenPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [retenidos, setRetenidos] = useState<RetenidoItem[]>([]);
  const pointerStartX = useRef<number | null>(null);
  const swipingId = useRef<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/waiter/kitchen/orders');
      if (r.ok) {
        const json = await r.json() as KitchenResponse;
        setOrders(json.orders);
        setRetenidos(json.retenidos);
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

  const handlePointerUp = useCallback((e: React.PointerEvent, orderId: string, currentEstado: string) => {
    if (swipingId.current !== orderId || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingId.current = null;

    const transitions: Record<string, string> = { pendiente: 'anotado', anotado: 'preparado' };
    const nextState = transitions[currentEstado];

    if (delta > -80 || !nextState) {
      el.style.transition = 'transform 0.25s ease';
      el.style.transform = 'translateX(0)';
      return;
    }

    const isFinal = nextState === 'preparado';
    if (isFinal) {
      el.style.transition = 'transform 0.18s ease';
      el.style.transform = 'translateX(-100%)';
    } else {
      el.style.transition = 'transform 0.25s ease';
      el.style.transform = 'translateX(0)';
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

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div
        className="fixed top-0 left-0 right-0 z-10 flex h-12 items-center gap-3 px-4 shadow-lg"
        style={{ background: "oklch(17% 0.025 252)", borderBottom: "1px solid oklch(42% 0.14 62 / 0.35)" }}
      >
        <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
          <ChevronLeft className="w-4 h-4" />
          {t("waiterLogout", lang)}
        </a>
        <UtensilsCrossed className="w-4 h-4" style={{ color: "oklch(72% 0.14 62)" }} />
        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{t("kitchenTitle", lang)}</span>
        <span className="text-[10px]" style={{ color: TEXT_DIM }}>({orders.length})</span>
      </div>

      <div className="pt-12 px-3 pb-6">
        {/* Color legend */}
        <div className="flex flex-wrap gap-2 py-3 px-1">
          {([
            { key: 'colorNeutral', bg: TIME_COLORS[0].bg },
            { key: 'colorYellow', bg: TIME_COLORS[1].bg },
            { key: 'colorOrange', bg: TIME_COLORS[2].bg },
            { key: 'colorRedOrange', bg: TIME_COLORS[3].bg },
            { key: 'colorRed', bg: TIME_COLORS[4].bg },
            { key: 'colorDeepRed', bg: TIME_COLORS[5].bg },
          ] as const).map(({ key, bg }) => (
            <span
              key={key}
              className="rounded px-2 py-0.5 text-[10px] font-medium"
              style={{ background: bg, color: TEXT_DIM }}
            >
              {t(key, lang)}
            </span>
          ))}
        </div>

        {/* Retenidos section */}
        {retenidos.length > 0 && (
          <div className="mb-4 mt-3">
            <div className="flex items-center gap-2 px-1 mb-2">
              <TimerOff className="w-4 h-4" style={{ color: "oklch(72% 0.14 62)" }} />
              <span className="text-xs font-semibold" style={{ color: TEXT_DIM }}>
                Retenidos ({retenidos.length})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {retenidos.map((item, idx) => {
                const elapsed = getElapsedMinutes(item.sesionCreatedAt);
                const timeColor = getTimeColor(elapsed);
                const tableLabel = item.mesaNombre ?? `Mesa ${item.mesaNumero ?? '—'}`;
                return (
                  <div
                    key={`${item.itemId}-${idx}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{
                      background: timeColor.bg,
                      border: `1px solid ${timeColor.border}`,
                    }}
                  >
                    <div className="flex items-center gap-2 text-xs" style={{ color: TEXT_MAIN }}>
                      <span className="font-medium">{item.cantidad}x</span>
                      <span>{item.nombre}</span>
                      {item.complementos && (
                        <span className="text-[10px]" style={{ color: TEXT_DIM }}>
                          ({item.complementos})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px]" style={{ color: TEXT_DIM }}>
                      <span>{tableLabel}</span>
                      <span className="font-mono">{formatTimer(elapsed)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orders list */}
        <div className="flex flex-col gap-3">
          {orders.length === 0 && retenidos.length === 0 && (
            <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
              No hay pedidos de cocina activos
            </div>
          )}
          {orders.map(order => {
            const elapsed = getElapsedMinutes(order.createdAt);
            const timeColor = getTimeColor(elapsed);
            const tableLabel = order.mesaNombre ?? `Mesa ${order.mesaNumero ?? '—'}`;
            const nextLabel: Record<string, string> = {
              pendiente: t("orderStatusAnotado", lang),
              anotado: t("orderStatusPreparado", lang),
            };
            const hasSwipe = order.estado in nextLabel;

            return (
              <div
                key={order.id}
                className="relative rounded-xl overflow-hidden select-none"
                style={{
                  background: timeColor.bg,
                  border: `1px solid ${timeColor.border}`,
                  touchAction: 'pan-y',
                  willChange: 'transform',
                }}
                onPointerDown={e => handlePointerDown(e, order.id)}
                onPointerMove={e => handlePointerMove(e, order.id)}
                onPointerUp={e => handlePointerUp(e, order.id, order.estado)}
                onPointerCancel={handlePointerCancel}
              >
                {/* Swipe reveal background */}
                {hasSwipe && (
                  <div
                    className="absolute inset-0 flex items-center justify-end pr-5"
                    style={{ background: nextLabel[order.estado] === t("orderStatusPreparado", lang) ? 'oklch(28% 0.16 148)' : 'oklch(26% 0.10 252)' }}
                  >
                    <span className="text-xs font-bold" style={{ color: "oklch(75% 0.18 148)" }}>
                      {nextLabel[order.estado]} ✓
                    </span>
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
                    <span
                      className="text-xs font-mono font-bold"
                      style={{ color: timeColor === TIME_COLORS[0] ? TEXT_DIM : "oklch(92% 0.10 40)" }}
                    >
                      {formatTimer(elapsed)}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="text-xs" style={{ color: TEXT_MAIN }}>
                        <span className="font-medium">{item.cantidad}x</span>{' '}
                        {item.nombre}
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
                      style={order.estado === 'preparado' ? {
                        background: "oklch(30% 0.12 148 / 0.4)",
                        color: "oklch(75% 0.18 148)",
                      } : {
                        background: "oklch(30% 0.10 252 / 0.4)",
                        color: "oklch(75% 0.12 252)",
                      }}
                    >
                      {order.estado === 'pendiente' ? t("orderStatusPending", lang) : order.estado === 'anotado' ? t("orderStatusAnotado", lang) : t("orderStatusPreparado", lang)}
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
