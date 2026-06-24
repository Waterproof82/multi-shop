'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, ChevronLeft, Layers } from 'lucide-react';
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

function playNotificationSound() {
  try {
    const audio = new Audio('/bell.mp3');
    audio.volume = 0.7;
    void audio.play();
  } catch { /* audio not available */ }
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

interface MergedKitchenItem {
  mergeKey: string;
  nombre: string;
  complementos?: string;
  totalCantidad: number;
  representativeEstado: ItemEstado;
  items: KitchenItem[];
}

function groupKitchenItems(items: KitchenItem[]): MergedKitchenItem[] {
  const map = new Map<string, MergedKitchenItem>();
  for (const item of items) {
    // Include estado in the key: items with same name but different estado stay separate
    const key = `${item.nombre}|${item.complementos ?? ''}|${item.estado}`;
    if (!map.has(key)) {
      map.set(key, { mergeKey: key, nombre: item.nombre, complementos: item.complementos, totalCantidad: 0, representativeEstado: item.estado, items: [] });
    }
    const g = map.get(key)!;
    g.totalCantidad += item.cantidad;
    g.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => {
    const nameComp = a.nombre.localeCompare(b.nombre);
    return nameComp !== 0 ? nameComp : a.representativeEstado.localeCompare(b.representativeEstado);
  });
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
  return new Map([...map.entries()].sort((a, b) => a[1].firstCreatedAt.localeCompare(b[1].firstCreatedAt)));
}

export default function KitchenPage() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];

  const [items, setItems] = useState<KitchenItem[]>([]);
  const [countdowns, setCountdowns] = useState<Record<string, number>>({});
  const [groupBy, setGroupBy] = useState<'order' | 'mesa'>('order');
  const [groupedMesas, setGroupedMesas] = useState<Set<string>>(new Set());
  const [globalGrouped, setGlobalGrouped] = useState(false);
  const [pendingMergedAction, setPendingMergedAction] = useState<{ items: KitchenItem[]; action: 'pendiente' | 'en_preparacion' | 'listo' } | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const pointerStartX = useRef<number | null>(null);
  const swipingKey    = useRef<string | null>(null);
  const prevItemCountRef = useRef<number | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch('/api/kitchen/items');
      if (r.status === 401) { window.location.href = '/waiter'; return; }
      if (r.ok) {
        const json = await r.json() as { items: KitchenItem[] };
        const incoming = json.items ?? [];
        const count = incoming.filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion').length;
        if (prevItemCountRef.current !== null && count > prevItemCountRef.current) {
          playNotificationSound();
        }
        prevItemCountRef.current = count;
        setItems(incoming);
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

  const handlePointerUpMerged = useCallback((e: React.PointerEvent, mergedKey: string, merged: MergedKitchenItem) => {
    if (swipingKey.current !== mergedKey || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el    = e.currentTarget as HTMLElement;
    pointerStartX.current = null;
    swipingKey.current    = null;
    const snapBack = () => {
      const content = el.querySelector<HTMLElement>('[data-card-content]');
      const hintFwd = el.querySelector<HTMLElement>('[data-hint-fwd]');
      if (content) { content.style.transition = 'transform 0.25s ease'; content.style.transform = 'translateX(0)'; }
      if (hintFwd) hintFwd.style.opacity = '0';
    };
    if (Math.abs(delta) < THRESHOLD) { snapBack(); return; }

    if (delta > 0) {
      // Right swipe → revert (only from en_preparacion → pendiente)
      if (merged.representativeEstado === 'en_preparacion') {
        snapBack();
        setPendingMergedAction({ items: merged.items, action: 'pendiente' });
      } else {
        snapBack();
      }
      return;
    }

    // Left swipe → advance
    const action = merged.representativeEstado === 'en_preparacion' ? 'listo' : 'en_preparacion';
    snapBack();
    setPendingMergedAction({ items: merged.items, action });
  }, []);

  const confirmMergedAction = useCallback(async () => {
    if (!pendingMergedAction) return;
    const { items: toProcess, action } = pendingMergedAction;
    setPendingMergedAction(null);
    if (action === 'listo') {
      toProcess.forEach(item => startCountdown(item.pedidoId, item.itemIdx));
    } else {
      await Promise.all(toProcess.map(item => patchEstado(item.pedidoId, item.itemIdx, action)));
    }
  }, [pendingMergedAction, patchEstado, startCountdown]);

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

        {/* Group-by toggle */}
        {items.length > 0 && (
          <div className="flex gap-1 px-1 pt-2 pb-3">
            {(['order', 'mesa'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setGroupBy(mode)}
                className="rounded px-3 py-1 text-[11px] font-semibold transition-colors"
                style={groupBy === mode ? {
                  background: 'oklch(32% 0.10 252)',
                  color: TEXT_MAIN,
                  border: '1px solid oklch(50% 0.10 252 / 0.6)',
                } : {
                  background: 'transparent',
                  color: TEXT_DIM,
                  border: '1px solid oklch(35% 0.06 252 / 0.4)',
                }}
              >
                {mode === 'order' ? t('kitchenGroupByOrder', lang) : t('kitchenGroupByTable', lang)}
              </button>
            ))}
          </div>
        )}

        {groupBy === 'mesa' && items.length > 0 && (
          <div className="flex flex-col gap-5">
            {Array.from(groupByMesa(items).entries()).map(([mesaKey, mesaGroup]) => {
              const elapsed    = getElapsedMinutes(mesaGroup.firstCreatedAt);
              const isGrouped  = groupedMesas.has(mesaKey);
              const sorted     = [...mesaGroup.items].sort((a, b) => {
                const nameComp = a.nombre.localeCompare(b.nombre);
                return nameComp !== 0 ? nameComp : a.createdAt.localeCompare(b.createdAt);
              });
              const mergedItems = isGrouped ? groupKitchenItems(sorted) : null;
              return (
                <div key={mesaKey} className="rounded-xl overflow-hidden" style={{ border: '1px solid oklch(35% 0.08 252 / 0.5)' }}>
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ background: 'oklch(18% 0.03 252)', borderBottom: '1px solid oklch(35% 0.08 252 / 0.4)' }}
                  >
                    <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{mesaKey}</span>
                    <span className="text-[10px] font-mono" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
                    <button
                      onClick={() => setGroupedMesas(prev => { const next = new Set(prev); if (next.has(mesaKey)) next.delete(mesaKey); else next.add(mesaKey); return next; })}
                      title="Agrupar ítems"
                      className="ml-auto flex items-center justify-center rounded-lg"
                      style={{
                        width: 38, height: 28,
                        background: isGrouped ? 'oklch(28% 0.16 228)' : 'oklch(20% 0.04 252)',
                        color: isGrouped ? 'oklch(78% 0.20 228)' : TEXT_DIM,
                        border: isGrouped ? '1px solid oklch(50% 0.22 228 / 0.6)' : '1px solid oklch(35% 0.06 252 / 0.5)',
                      }}
                    >
                      <Layers className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    {isGrouped && mergedItems ? mergedItems.map(merged => {
                      const isEnPrep  = merged.representativeEstado === 'en_preparacion';
                      const cardColor = isEnPrep ? EN_PREP_COLOR : PENDIENTE_COLOR;
                      const mKey      = `merged:${mesaKey}:${merged.mergeKey}`;
                      const nextLabel = isEnPrep ? '✓ ' + t('kitchenItemListo', lang) : '→ ' + t('orderStatusAnotado', lang);
                      return (
                        <div
                          key={merged.mergeKey}
                          className="relative rounded-xl overflow-hidden select-none"
                          style={{ background: cardColor.bg, border: `1px solid ${cardColor.border}`, touchAction: 'pan-y', willChange: 'transform' }}
                          onPointerDown={e => handlePointerDown(e, mKey)}
                          onPointerMove={e => handlePointerMove(e, mKey)}
                          onPointerUp={e => handlePointerUpMerged(e, mKey, merged)}
                          onPointerCancel={handlePointerCancel}
                        >
                          {isEnPrep && (
                            <div
                              data-hint-back=""
                              className="absolute inset-0 flex items-center px-3 rounded-xl"
                              style={{ opacity: 0, background: PENDIENTE_COLOR.bg, transition: 'opacity 0.1s' }}
                            >
                              <span className="pointer-events-none text-[10px] font-bold" style={{ color: 'oklch(68% 0.18 240)' }}>
                                {'← ' + t('orderStatusPending', lang)}
                              </span>
                            </div>
                          )}
                          <div
                            data-hint-fwd=""
                            className="absolute inset-0 flex items-center justify-end px-3 rounded-xl"
                            style={{ opacity: 0, background: isEnPrep ? COUNTDOWN_COLOR.bg : EN_PREP_COLOR.bg, transition: 'opacity 0.1s' }}
                          >
                            <span className="pointer-events-none text-[10px] font-bold" style={{ color: isEnPrep ? 'oklch(78% 0.22 148)' : 'oklch(82% 0.24 90)' }}>
                              {nextLabel}
                            </span>
                          </div>
                          <div data-card-content="" className="flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{merged.totalCantidad}×</span>
                                <span className="text-xs font-medium truncate" style={{ color: TEXT_MAIN }}>{merged.nombre}</span>
                              </div>
                              {merged.complementos && <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({merged.complementos})</span>}
                            </div>
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={isEnPrep ? { background: 'oklch(32% 0.16 90 / 0.5)', color: 'oklch(82% 0.20 90)' } : { background: 'oklch(30% 0.10 252 / 0.4)', color: 'oklch(75% 0.12 252)' }}>
                              {isEnPrep ? t('orderStatusAnotado', lang) : t('orderStatusPending', lang)}
                            </span>
                          </div>
                        </div>
                      );
                    }) : sorted.map(item => {
                      const key         = makeKey(item.pedidoId, item.itemIdx);
                      const isCountdown = key in countdowns;
                      const remaining   = countdowns[key] ?? 0;
                      const isEnPrep    = item.estado === 'en_preparacion';
                      const cardColor   = isCountdown ? COUNTDOWN_COLOR : isEnPrep ? EN_PREP_COLOR : PENDIENTE_COLOR;

                      return (
                        <div
                          key={key}
                          className="relative rounded-xl overflow-hidden select-none"
                          style={{ background: cardColor.bg, border: `1px solid ${cardColor.border}`, touchAction: 'pan-y', willChange: 'transform' }}
                          onPointerDown={isCountdown ? undefined : e => handlePointerDown(e, key)}
                          onPointerMove={isCountdown ? undefined : e => handlePointerMove(e, key)}
                          onPointerUp={isCountdown ? undefined : e => handlePointerUp(e, item)}
                          onPointerCancel={isCountdown ? undefined : handlePointerCancel}
                        >
                          {!isCountdown && (
                            <>
                              <div
                                data-hint-back=""
                                className="absolute inset-0 flex items-center px-3 rounded-xl"
                                style={{ opacity: 0, background: isEnPrep ? PENDIENTE_COLOR.bg : 'transparent', transition: 'opacity 0.1s' }}
                              >
                                <span className="pointer-events-none text-[10px] font-bold" style={{ color: 'oklch(68% 0.18 240)' }}>
                                  {isEnPrep ? '← ' + t('orderStatusPending', lang) : ''}
                                </span>
                              </div>
                              <div
                                data-hint-fwd=""
                                className="absolute inset-0 flex items-center justify-end px-3 rounded-xl"
                                style={{ opacity: 0, background: isEnPrep ? COUNTDOWN_COLOR.bg : EN_PREP_COLOR.bg, transition: 'opacity 0.1s' }}
                              >
                                <span className="pointer-events-none text-[10px] font-bold" style={{ color: isEnPrep ? 'oklch(78% 0.22 148)' : 'oklch(82% 0.24 90)' }}>
                                  {isEnPrep ? '✓ ' + t('kitchenItemListo', lang) : '→ ' + t('orderStatusAnotado', lang)}
                                </span>
                              </div>
                            </>
                          )}
                          <div data-card-content="" className="relative flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
                            {isCountdown && (
                              <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-base font-bold" style={{ background: 'oklch(32% 0.20 148)', color: 'oklch(80% 0.22 148)', border: '2px solid oklch(55% 0.28 148 / 0.7)' }}>
                                {remaining}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{item.cantidad}×</span>
                                <span className="text-xs font-medium truncate" style={{ color: TEXT_MAIN }}>{item.nombre || '—'}</span>
                              </div>
                              {item.complementos && <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({item.complementos})</span>}
                            </div>
                            <div className="shrink-0">
                              {isCountdown ? (
                                <button className="rounded px-2 py-1 text-[10px] font-bold" style={{ background: 'oklch(26% 0.08 25)', color: 'oklch(75% 0.18 25)' }} onClick={() => cancelCountdown(item.pedidoId, item.itemIdx)}>
                                  {t('kitchenCountdownCancel', lang)}
                                </button>
                              ) : (
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={isEnPrep ? { background: 'oklch(32% 0.16 90 / 0.5)', color: 'oklch(82% 0.20 90)' } : { background: 'oklch(30% 0.10 252 / 0.4)', color: 'oklch(75% 0.12 252)' }}>
                                  {isEnPrep ? t('orderStatusAnotado', lang) : t('orderStatusPending', lang)}
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
        )}

        {groupBy === 'order' && (
        <div className="flex flex-col gap-4 pt-2">
          {/* Agrupar todo toggle */}
          <div className="flex justify-end px-1">
            <button
              onClick={() => setGlobalGrouped(p => !p)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
              style={{
                background: globalGrouped ? 'oklch(28% 0.16 228)' : 'oklch(20% 0.04 252)',
                color: globalGrouped ? 'oklch(78% 0.20 228)' : TEXT_DIM,
                border: globalGrouped ? '1px solid oklch(50% 0.22 228 / 0.6)' : '1px solid oklch(35% 0.06 252 / 0.5)',
              }}
            >
              <Layers className="w-3.5 h-3.5" />
              Agrupar todo
            </button>
          </div>

          {/* Vista global agrupada */}
          {globalGrouped && (() => {
            const allMerged = groupKitchenItems(items);
            return (
              <div className="flex flex-col gap-2">
                {allMerged.map(merged => {
                  const isEnPrep  = merged.representativeEstado === 'en_preparacion';
                  const cardColor = isEnPrep ? EN_PREP_COLOR : PENDIENTE_COLOR;
                  const mKey      = `global:${merged.mergeKey}`;
                  const nextLabel = isEnPrep ? '✓ ' + t('kitchenItemListo', lang) : '→ ' + t('orderStatusAnotado', lang);
                  return (
                    <div
                      key={merged.mergeKey}
                      className="relative rounded-xl overflow-hidden select-none"
                      style={{ background: cardColor.bg, border: `1px solid ${cardColor.border}`, touchAction: 'pan-y', willChange: 'transform' }}
                      onPointerDown={e => handlePointerDown(e, mKey)}
                      onPointerMove={e => handlePointerMove(e, mKey)}
                      onPointerUp={e => handlePointerUpMerged(e, mKey, merged)}
                      onPointerCancel={handlePointerCancel}
                    >
                      {isEnPrep && (
                        <div
                          data-hint-back=""
                          className="absolute inset-0 flex items-center px-3 rounded-xl"
                          style={{ opacity: 0, background: PENDIENTE_COLOR.bg, transition: 'opacity 0.1s' }}
                        >
                          <span className="pointer-events-none text-[10px] font-bold" style={{ color: 'oklch(68% 0.18 240)' }}>
                            {'← ' + t('orderStatusPending', lang)}
                          </span>
                        </div>
                      )}
                      <div
                        data-hint-fwd=""
                        className="absolute inset-0 flex items-center justify-end px-3 rounded-xl"
                        style={{ opacity: 0, background: isEnPrep ? COUNTDOWN_COLOR.bg : EN_PREP_COLOR.bg, transition: 'opacity 0.1s' }}
                      >
                        <span className="pointer-events-none text-[10px] font-bold" style={{ color: isEnPrep ? 'oklch(78% 0.22 148)' : 'oklch(82% 0.24 90)' }}>
                          {nextLabel}
                        </span>
                      </div>
                      <div data-card-content="" className="flex items-center gap-3 px-3 py-2.5" style={{ background: cardColor.bg }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-bold" style={{ color: TEXT_MAIN }}>{merged.totalCantidad}×</span>
                            <span className="text-xs font-medium truncate" style={{ color: TEXT_MAIN }}>{merged.nombre}</span>
                          </div>
                          {merged.complementos && <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({merged.complementos})</span>}
                        </div>
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={isEnPrep ? { background: 'oklch(32% 0.16 90 / 0.5)', color: 'oklch(82% 0.20 90)' } : { background: 'oklch(30% 0.10 252 / 0.4)', color: 'oklch(75% 0.12 252)' }}>
                          {isEnPrep ? t('orderStatusAnotado', lang) : t('orderStatusPending', lang)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Vista por pedido (solo cuando no está agrupado globalmente) */}
          {!globalGrouped && Array.from(grouped.entries()).map(([pedidoId, group]) => {
            const tableLabel = group.mesaNombre ?? `Mesa ${group.mesaNumero ?? '—'}`;
            const elapsed    = getElapsedMinutes(group.createdAt);

            return (
              <div key={pedidoId}>
                {/* Order header */}
                <div className="flex items-center gap-2 px-1 mb-2">
                  <span className="text-xs font-bold" style={{ color: 'oklch(72% 0.14 62)' }}>#{group.numeroPedido}</span>
                  <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{tableLabel}</span>
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
                        {!isCountdown && (
                          <>
                            {/* Right drag = revert → hint on LEFT with background */}
                            <div
                              data-hint-back=""
                              className="absolute inset-0 flex items-center px-3 rounded-xl"
                              style={{ opacity: 0, background: isEnPrep ? PENDIENTE_COLOR.bg : 'transparent', transition: 'opacity 0.1s' }}
                            >
                              <span className="pointer-events-none text-[10px] font-bold" style={{ color: 'oklch(68% 0.18 240)' }}>
                                {isEnPrep ? '← ' + t('orderStatusPending', lang) : ''}
                              </span>
                            </div>
                            {/* Left drag = advance → hint on RIGHT with background */}
                            <div
                              data-hint-fwd=""
                              className="absolute inset-0 flex items-center justify-end px-3 rounded-xl"
                              style={{ opacity: 0, background: isEnPrep ? COUNTDOWN_COLOR.bg : EN_PREP_COLOR.bg, transition: 'opacity 0.1s' }}
                            >
                              <span className="pointer-events-none text-[10px] font-bold" style={{ color: isEnPrep ? 'oklch(78% 0.22 148)' : 'oklch(82% 0.24 90)' }}>
                                {isEnPrep ? '✓ ' + t('kitchenItemListo', lang) : '→ ' + t('orderStatusAnotado', lang)}
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
                              <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({item.complementos})</span>
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
        )}
      </div>

      {/* Merged-group action confirmation dialog */}
      {pendingMergedAction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'oklch(0% 0 0 / 0.72)' }}
          onClick={() => setPendingMergedAction(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'oklch(16% 0.04 252)', border: '1px solid oklch(45% 0.12 252 / 0.5)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                {pendingMergedAction.action === 'listo'
                  ? t('kitchenItemListo', lang)
                  : pendingMergedAction.action === 'en_preparacion'
                    ? t('orderStatusAnotado', lang)
                    : t('orderStatusPending', lang)}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: TEXT_DIM }}>
                {pendingMergedAction.items.length} {pendingMergedAction.items.length === 1 ? 'pedido' : 'pedidos'} se procesarán a la vez.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingMergedAction(null)}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: 'oklch(20% 0.04 252)', color: TEXT_DIM, border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
              >
                {t('kitchenCountdownCancel', lang)}
              </button>
              <button
                onClick={() => void confirmMergedAction()}
                className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: pendingMergedAction.action === 'listo' ? 'oklch(28% 0.16 148)' : 'oklch(28% 0.16 90)', color: pendingMergedAction.action === 'listo' ? 'oklch(82% 0.22 148)' : 'oklch(85% 0.20 90)', border: pendingMergedAction.action === 'listo' ? '1px solid oklch(50% 0.28 148 / 0.6)' : '1px solid oklch(55% 0.28 90 / 0.6)' }}
              >
                {t('kitchenConfirmProcess', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
