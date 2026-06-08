'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'bar_served_keys';

function loadServedKeys(): Set<string> {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
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
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { Wine, ChevronLeft } from 'lucide-react';

interface BarOrder {
  id: string;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  items: { nombre: string; cantidad: number }[];
  estado: string;
  createdAt: string;
  sesionId: string | null;
  tipo: 'bebida';
}

interface FlatBarItem {
  key: string;         // `${orderId}:${itemIdx}` — unique swipe key
  orderId: string;
  itemIdx: number;
  totalInOrder: number;
  numeroPedido: number;
  mesaNumero: number | null;
  mesaNombre: string | null;
  createdAt: string;
  nombre: string;
  cantidad: number;
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

const KITCHEN_ALERT_ACCENT = 'oklch(78% 0.20 148)';

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
  const [orders, setOrders]         = useState<BarOrder[]>([]);
  const [servedKeys, setServedKeys]  = useState<Set<string>>(loadServedKeys);
  const [countdowns, setCountdowns]  = useState<Record<string, number>>({});
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
    const poll = setInterval(fetchOrders, 3000);
    return () => clearInterval(poll);
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
      if (pending.size > 0) {
        const current = loadServedKeys();
        for (const key of pending.keys()) current.add(key);
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
          clearServedKeysForOrder(orderId);
          fetch(`/api/waiter/orders/${encodeURIComponent(orderId)}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'servido' }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────

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
          setTimeout(() => {
            setServedKeys(prevServed => {
              const next = new Set(prevServed);
              next.add(key);
              persistServedKeys(next);
              const servedCount = [...next].filter(k => k.startsWith(`${flatItem.orderId}:`)).length;
              if (servedCount >= flatItem.totalInOrder) {
                fetch(`/api/waiter/orders/${encodeURIComponent(flatItem.orderId)}/status`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ estado: 'servido' }),
                }).then(r => {
                  if (r.ok) {
                    clearServedKeysForOrder(flatItem.orderId);
                    setOrders(prev => prev.filter(o => o.id !== flatItem.orderId));
                    setServedKeys(s => {
                      const cleaned = new Set(s);
                      cleaned.forEach(k => { if (k.startsWith(`${flatItem.orderId}:`)) cleaned.delete(k); });
                      persistServedKeys(cleaned);
                      return cleaned;
                    });
                  } else {
                    setServedKeys(s => {
                      const r = new Set(s); r.delete(key);
                      persistServedKeys(r);
                      return r;
                    });
                  }
                }).catch(() => {
                  setServedKeys(s => {
                    const r = new Set(s); r.delete(key);
                    persistServedKeys(r);
                    return r;
                  });
                });
              }
              return next;
            });
          }, 0);
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: remaining };
      });
    }, 1000);
    timersRef.current.set(key, interval);
  }, []);

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
    const delta   = Math.min(0, e.clientX - pointerStartX.current); // only left drag
    const el      = e.currentTarget as HTMLElement;
    const content = el.querySelector<HTMLElement>('[data-card-content]');
    const hint    = el.querySelector<HTMLElement>('[data-hint]');
    // Translate inner content only — reveal-bg stays stationary, hint never overlaps card text
    if (content) { content.style.transform = `translateX(${delta}px)`; content.style.transition = 'none'; }
    if (hint) { hint.style.opacity = delta < -20 ? String(Math.min(1, (-delta - 20) / 40)) : '0'; }
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

    if (delta > -SWIPE_THRESHOLD) { snapContentBack(); return; }

    // Snap content back, then start countdown
    snapContentBack();
    startCountdown(flatItem);
  }, [startCountdown]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const el      = e.currentTarget as HTMLElement;
    const content = el.querySelector<HTMLElement>('[data-card-content]');
    const hint    = el.querySelector<HTMLElement>('[data-hint]');
    if (content) { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
    if (hint) { hint.style.opacity = '0'; }
    pointerStartX.current = null;
    swipingId.current     = null;
  }, []);

  // Flatten orders into one card per drink item, excluding locally served ones
  const flatItems: FlatBarItem[] = orders.flatMap(order =>
    order.items.map((item, idx) => ({
      key:          `${order.id}:${idx}`,
      orderId:      order.id,
      itemIdx:      idx,
      totalInOrder: order.items.length,
      numeroPedido: order.numeroPedido,
      mesaNumero:   order.mesaNumero,
      mesaNombre:   order.mesaNombre,
      createdAt:    order.createdAt,
      nombre:       item.nombre,
      cantidad:     item.cantidad,
    }))
  ).filter(item => !servedKeys.has(item.key));

  const hasAnyContent = flatItems.length > 0;

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
        <span className="text-[10px]" style={{ color: TEXT_DIM }}>({flatItems.length})</span>
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

        {/* Swipeable drink orders grouped by pedido */}
        <div className="flex flex-col gap-4">
          {!hasAnyContent && (
            <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
              {t("barEmpty", lang)}
            </div>
          )}

          {Array.from(
            flatItems.reduce<Map<string, { numeroPedido: number; mesaNumero: number | null; mesaNombre: string | null; createdAt: string; items: FlatBarItem[] }>>(
              (acc, item) => {
                if (!acc.has(item.orderId)) {
                  acc.set(item.orderId, { numeroPedido: item.numeroPedido, mesaNumero: item.mesaNumero, mesaNombre: item.mesaNombre, createdAt: item.createdAt, items: [] });
                }
                acc.get(item.orderId)!.items.push(item);
                return acc;
              },
              new Map()
            ).entries()
          ).map(([orderId, group]) => {
            const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
            const elapsed    = getElapsedMinutes(group.createdAt);
            return (
              <div key={orderId}>
                {/* Order header */}
                <div className="flex items-center gap-2 px-1 mb-1.5">
                  <span className="text-xs font-bold" style={{ color: TEXT_DIM }}>#{group.numeroPedido}</span>
                  <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{tableLabel}</span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                </div>

                {/* Items */}
                <div className="flex flex-col gap-2">
                  {group.items.map(flatItem => {
                    const timeColor   = getTimeColor(getElapsedMinutes(flatItem.createdAt));
                    const isCountdown = flatItem.key in countdowns;
                    const remaining   = countdowns[flatItem.key] ?? 0;
                    const cardColor   = isCountdown ? COUNTDOWN_COLOR : timeColor;
                    return (
                      <div
                        key={flatItem.key}
                        className="relative rounded-xl overflow-hidden select-none"
                        style={{
                          background:  cardColor.bg,
                          border:      `1px solid ${cardColor.border}`,
                          touchAction: 'pan-y',
                          willChange:  'transform',
                        }}
                        onPointerDown={isCountdown ? undefined : e => handlePointerDown(e, flatItem.key)}
                        onPointerMove={isCountdown ? undefined : e => handlePointerMove(e, flatItem.key)}
                        onPointerUp={isCountdown ? undefined : e => handlePointerUp(e, flatItem)}
                        onPointerCancel={isCountdown ? undefined : handlePointerCancel}
                      >
                        {/* Reveal background — only when not counting down */}
                        {!isCountdown && (
                          <div
                            className="absolute inset-0 flex items-center justify-end pr-3"
                            style={{ background: 'oklch(28% 0.16 148)' }}
                          >
                            <span data-hint="" className="text-xs font-bold" style={{ color: KITCHEN_ALERT_ACCENT, opacity: 0 }}>
                              {t("orderStatusServido", lang)} ✓
                            </span>
                          </div>
                        )}

                        {/* Card content — translates during drag */}
                        <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
                          {isCountdown ? (
                            <>
                              <div
                                className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-base font-bold"
                                style={{ background: 'oklch(32% 0.20 148)', color: 'oklch(80% 0.22 148)', border: '2px solid oklch(55% 0.28 148 / 0.7)' }}
                              >
                                {remaining}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{flatItem.cantidad}× {flatItem.nombre}</span>
                              </div>
                              <button
                                className="rounded px-2 py-1 text-[10px] font-bold shrink-0"
                                style={{ background: 'oklch(26% 0.08 25)', color: 'oklch(75% 0.18 25)' }}
                                onClick={() => cancelCountdown(flatItem.key)}
                              >
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
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
