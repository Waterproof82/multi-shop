'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft } from 'lucide-react';
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
}

const BG        = 'oklch(13% 0.02 252)';
const TEXT_MAIN = 'oklch(92% 0.02 252)';
const TEXT_DIM  = 'oklch(55% 0.04 252)';

const PENDIENTE_COLOR    = { bg: 'oklch(20% 0.06 240)',  border: 'oklch(42% 0.12 240 / 0.45)' };
const EN_PREP_COLOR      = { bg: 'oklch(28% 0.22 90)',   border: 'oklch(62% 0.30 90  / 0.65)' };
const COUNTDOWN_COLOR    = { bg: 'oklch(24% 0.18 148)',  border: 'oklch(55% 0.28 148 / 0.65)' };

const THRESHOLD = 80;
const COUNTDOWN_SECONDS = 5;

function makeKey(pedidoId: string, itemIdx: number) {
  return `${pedidoId}:${itemIdx}`;
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

export default function KitchenPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];

  const [items, setItems] = useState<KitchenItem[]>([]);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const pointerStartX = useRef<number | null>(null);
  const swipingKey    = useRef<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch('/api/kitchen/items');
      if (r.status === 401) { window.location.href = '/waiter'; return; }
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

  // Tick timers every second
  useEffect(() => {
    const tick = setInterval(() => setItems(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(id => clearInterval(id)); };
  }, []);

  // ── Countdown helpers ──────────────────────────────────────────────────────

  const startCountdown = useCallback((pedidoId: string, itemIdx: number) => {
    const key = makeKey(pedidoId, itemIdx);
    if (timersRef.current.has(key)) return; // already counting

    setCountdowns(prev => ({ ...prev, [key]: COUNTDOWN_SECONDS }));

    const interval = setInterval(() => {
      setCountdowns(prev => {
        const remaining = (prev[key] ?? 1) - 1;
        if (remaining <= 0) {
          clearInterval(timersRef.current.get(key));
          timersRef.current.delete(key);
          // fire PATCH after state settles
          setTimeout(() => {
            fetch(`/api/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ estado: 'listo' }),
            }).then(r => {
              if (r.ok) {
                setItems(p => p.filter(i => !(i.pedidoId === pedidoId && i.itemIdx === itemIdx)));
              }
            }).catch(() => { /* ignore, next poll will re-sync */ });
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

  const cancelCountdown = useCallback((pedidoId: string, itemIdx: number) => {
    const key = makeKey(pedidoId, itemIdx);
    const interval = timersRef.current.get(key);
    if (interval) clearInterval(interval);
    timersRef.current.delete(key);
    setCountdowns(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ── PATCH helper ───────────────────────────────────────────────────────────

  const patchEstado = useCallback(async (pedidoId: string, itemIdx: number, estado: ItemEstado) => {
    const r = await fetch(`/api/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    if (r.ok) {
      setItems(prev => prev.map(i =>
        i.pedidoId === pedidoId && i.itemIdx === itemIdx ? { ...i, estado } : i
      ));
    }
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
    const content   = el.querySelector<HTMLElement>('[data-card-content]');
    const hintFwd   = el.querySelector<HTMLElement>('[data-hint-fwd]');
    const hintBack  = el.querySelector<HTMLElement>('[data-hint-back]');
    if (content) { content.style.transform = `translateX(${delta}px)`; content.style.transition = 'none'; }
    // Forward hint (right side) — left drag = advance
    if (hintFwd)  hintFwd.style.opacity  = delta < 0 ? String(Math.min(1, -delta / THRESHOLD)) : '0';
    // Back hint (left side) — right drag = revert
    if (hintBack) hintBack.style.opacity = delta > 0 ? String(Math.min(1, delta / THRESHOLD)) : '0';
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, item: KitchenItem) => {
    const key = makeKey(item.pedidoId, item.itemIdx);
    if (swipingKey.current !== key || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingKey.current = null;

    const snapBack = () => {
      const content  = el.querySelector<HTMLElement>('[data-card-content]');
      const hintFwd  = el.querySelector<HTMLElement>('[data-hint-fwd]');
      const hintBack = el.querySelector<HTMLElement>('[data-hint-back]');
      if (content)  { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
      if (hintFwd)  hintFwd.style.opacity  = '0';
      if (hintBack) hintBack.style.opacity = '0';
    };

    if (Math.abs(delta) < THRESHOLD) { snapBack(); return; }

    if (delta < 0) {
      // Left swipe: advance (validate)
      if (item.estado === 'pendiente') {
        snapBack();
        void patchEstado(item.pedidoId, item.itemIdx, 'en_preparacion');
      } else if (item.estado === 'en_preparacion') {
        snapBack();
        startCountdown(item.pedidoId, item.itemIdx);
      }
    } else {
      // Right swipe: revert (only en_preparacion → pendiente)
      if (item.estado === 'en_preparacion') {
        snapBack();
        void patchEstado(item.pedidoId, item.itemIdx, 'pendiente');
      } else {
        snapBack();
      }
    }
  }, [patchEstado, startCountdown]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const el       = e.currentTarget as HTMLElement;
    const content  = el.querySelector<HTMLElement>('[data-card-content]');
    const hintFwd  = el.querySelector<HTMLElement>('[data-hint-fwd]');
    const hintBack = el.querySelector<HTMLElement>('[data-hint-back]');
    if (content)  { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
    if (hintFwd)  hintFwd.style.opacity  = '0';
    if (hintBack) hintBack.style.opacity = '0';
    pointerStartX.current = null;
    swipingKey.current    = null;
  }, []);

  // ── Group items by pedido ──────────────────────────────────────────────────

  const grouped = items.reduce<Map<string, { numeroPedido: number; mesaNumero: number | null; mesaNombre: string | null; createdAt: string; items: KitchenItem[] }>>(
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

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {/* Header */}
      <div
        className="fixed top-0 left-0 right-0 z-[200] flex h-12 items-center gap-3 px-4 shadow-lg"
        style={{ background: 'oklch(17% 0.025 252)', borderBottom: '1px solid oklch(42% 0.14 62 / 0.35)' }}
      >
        <a href="/waiter" className="flex items-center gap-1 text-xs font-medium" style={{ color: TEXT_DIM }}>
          <ChevronLeft className="w-4 h-4" />
          {t('waiterLogout', lang)}
        </a>
        <UtensilsCrossed className="w-4 h-4" style={{ color: 'oklch(72% 0.14 62)' }} />
        <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{t('kitchenTitle', lang)}</span>
        <span className="text-[10px]" style={{ color: TEXT_DIM }}>({items.length})</span>
      </div>

      <div className="pt-12 px-3 pb-6">
        {items.length === 0 && (
          <div className="text-center py-10 text-sm" style={{ color: TEXT_DIM }}>
            {t('kitchenEmpty', lang)}
          </div>
        )}

        <div className="flex flex-col gap-4 pt-2">
          {Array.from(grouped.entries()).map(([pedidoId, group]) => {
            const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
            const elapsed    = getElapsedMinutes(group.createdAt);

            return (
              <div key={pedidoId}>
                {/* Order header */}
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>#{group.numeroPedido}</span>
                  <span className="text-[10px]" style={{ color: TEXT_DIM }}>{tableLabel}</span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                </div>

                {/* Items */}
                <div className="flex flex-col gap-2">
                  {group.items.map(item => {
                    const key         = makeKey(item.pedidoId, item.itemIdx);
                    const isCountdown = key in countdowns;
                    const remaining   = countdowns[key] ?? 0;
                    const isEnPrep    = item.estado === 'en_preparacion';
                    const cardColor   = isCountdown ? COUNTDOWN_COLOR : isEnPrep ? EN_PREP_COLOR : PENDIENTE_COLOR;

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
                        onPointerDown={isCountdown ? undefined : e => handlePointerDown(e, key)}
                        onPointerMove={isCountdown ? undefined : e => handlePointerMove(e, key)}
                        onPointerUp={isCountdown ? undefined : e => handlePointerUp(e, item)}
                        onPointerCancel={isCountdown ? undefined : handlePointerCancel}
                      >
                        {/* Reveal hints — stationary; each on the side that gets revealed */}
                        {!isCountdown && (
                          <>
                            {/* Right drag = revert → hint on LEFT */}
                            <div className="absolute inset-0 flex items-center px-3">
                              <span
                                data-hint-back=""
                                className="pointer-events-none text-[10px] font-bold"
                                style={{ opacity: 0, color: 'oklch(68% 0.12 252)', transition: 'opacity 0.1s' }}
                              >
                                {isEnPrep ? '← ' + t('orderStatusPending', lang) : ''}
                              </span>
                            </div>
                            {/* Left drag = advance → hint on RIGHT */}
                            <div className="absolute inset-0 flex items-center justify-end px-3">
                              <span
                                data-hint-fwd=""
                                className="pointer-events-none text-[10px] font-bold"
                                style={{ opacity: 0, color: 'oklch(75% 0.18 148)', transition: 'opacity 0.1s' }}
                              >
                                {isEnPrep
                                  ? '✓ ' + t('kitchenItemListo', lang)
                                  : '→ ' + t('orderStatusAnotado', lang)}
                              </span>
                            </div>
                          </>
                        )}

                        {/* Card content — translates during drag */}
                        <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
                          {/* Countdown ring */}
                          {isCountdown && (
                            <div
                              className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-base font-bold"
                              style={{ background: 'oklch(32% 0.20 148)', color: 'oklch(80% 0.22 148)', border: '2px solid oklch(55% 0.28 148 / 0.7)' }}
                            >
                              {remaining}
                            </div>
                          )}

                          {/* Item info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{item.cantidad}×</span>
                              <span className="text-xs font-medium truncate" style={{ color: TEXT_MAIN }}>
                                {item.nombre || '—'}
                              </span>
                            </div>
                            {item.complementos && (
                              <span className="text-[10px]" style={{ color: TEXT_DIM }}>({item.complementos})</span>
                            )}
                          </div>

                          {/* Estado badge / cancel button */}
                          <div className="shrink-0">
                            {isCountdown ? (
                              <button
                                className="rounded px-2 py-1 text-[10px] font-bold"
                                style={{ background: 'oklch(26% 0.08 25)', color: 'oklch(75% 0.18 25)' }}
                                onClick={() => cancelCountdown(item.pedidoId, item.itemIdx)}
                              >
                                {t('kitchenCountdownCancel', lang)}
                              </button>
                            ) : (
                              <span
                                className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={isEnPrep ? {
                                  background: 'oklch(32% 0.16 90 / 0.5)',
                                  color:      'oklch(82% 0.20 90)',
                                } : {
                                  background: 'oklch(30% 0.10 252 / 0.4)',
                                  color:      'oklch(75% 0.12 252)',
                                }}
                              >
                                {isEnPrep
                                  ? t('orderStatusAnotado', lang)
                                  : t('orderStatusPending', lang)}
                              </span>
                            )}
                          </div>
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
