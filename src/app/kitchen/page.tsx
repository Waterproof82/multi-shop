'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { UtensilsCrossed, LogOut } from 'lucide-react';
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

const TIME_COLORS = [
  { max: 10,       bg: 'oklch(18% 0.06 228)', border: 'oklch(50% 0.22 228 / 0.55)' },
  { max: 20,       bg: 'oklch(19% 0.09 168)', border: 'oklch(52% 0.26 168 / 0.55)' },
  { max: 30,       bg: 'oklch(22% 0.14 100)', border: 'oklch(56% 0.28 100 / 0.55)' },
  { max: 45,       bg: 'oklch(24% 0.18 68)',  border: 'oklch(58% 0.30 68  / 0.60)' },
  { max: 60,       bg: 'oklch(24% 0.20 35)',  border: 'oklch(58% 0.33 35  / 0.65)' },
  { max: Infinity, bg: 'oklch(22% 0.22 16)',  border: 'oklch(56% 0.36 16  / 0.70)' },
];
const COUNTDOWN_COLOR = { bg: 'oklch(24% 0.18 148)', border: 'oklch(55% 0.28 148 / 0.65)' };
const EN_PREP_COLOR   = { bg: 'oklch(28% 0.22 90)',  border: 'oklch(62% 0.30 90  / 0.65)' };

const THRESHOLD         = 80;
const COUNTDOWN_SECONDS = 5;

function makeKey(pedidoId: string, itemIdx: number) {
  return `${pedidoId}:${itemIdx}`;
}

function playBell() {
  try { const a = new Audio('/bell.mp3'); a.volume = 0.7; void a.play(); } catch { /* ignore */ }
}

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
}

function formatTimer(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function getTimeColor(minutes: number) {
  for (const c of TIME_COLORS) if (minutes < c.max) return c;
  return TIME_COLORS.at(-1)!;
}

interface MergedItem {
  mergeKey: string;
  nombre: string;
  complementos?: string;
  totalCantidad: number;
  estado: ItemEstado;
  firstCreatedAt: string;
  items: KitchenItem[];
}

function resolveCardColor(isCountdown: boolean, isEnPrep: boolean, elapsed: number) {
  if (isCountdown) return COUNTDOWN_COLOR;
  if (isEnPrep) return EN_PREP_COLOR;
  return getTimeColor(elapsed);
}

function notMatchingItem(pedidoId: string, itemIdx: number): (i: KitchenItem) => boolean {
  return i => !(i.pedidoId === pedidoId && i.itemIdx === itemIdx);
}

function getMergedActionLabel(action: ItemEstado): string {
  if (action === 'listo') return 'listo';
  if (action === 'en_preparacion') return 'en preparaci\u00f3n';
  return 'pendiente';
}

function mergeByName(items: KitchenItem[]): MergedItem[] {
  const map = new Map<string, MergedItem>();
  for (const item of items) {
    const key = `${item.nombre}|${item.complementos ?? ''}|${item.estado}`;
    if (!map.has(key)) {
      map.set(key, { mergeKey: key, nombre: item.nombre, complementos: item.complementos, totalCantidad: 0, estado: item.estado, firstCreatedAt: item.createdAt, items: [] });
    }
    const g = map.get(key)!;
    g.totalCantidad += item.cantidad;
    if (item.createdAt < g.firstCreatedAt) g.firstCreatedAt = item.createdAt;
    g.items.push(item);
  }
  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

interface PedidoGroupValue { numeroPedido: number; mesaNumero: number | null; mesaNombre: string | null; createdAt: string; items: KitchenItem[] }
interface MesaGroupValue   { mesaNumero: number | null; mesaNombre: string | null; firstCreatedAt: string; items: KitchenItem[] }
type AnyGroupValue = PedidoGroupValue | MesaGroupValue;

function groupByPedido(items: KitchenItem[]): Map<string, PedidoGroupValue> {
  return items.reduce<Map<string, PedidoGroupValue>>(
    (acc, item) => {
      if (!acc.has(item.pedidoId)) {
        acc.set(item.pedidoId, { numeroPedido: item.numeroPedido, mesaNumero: item.mesaNumero, mesaNombre: item.mesaNombre, createdAt: item.createdAt, items: [] });
      }
      acc.get(item.pedidoId)!.items.push(item);
      return acc;
    },
    new Map()
  );
}

function groupByMesa(items: KitchenItem[]): Map<string, MesaGroupValue> {
  const map = new Map<string, MesaGroupValue>();
  for (const item of items) {
    const key = item.mesaNombre ?? `Mesa ${item.mesaNumero ?? '\u2014'}`;
    if (!map.has(key)) map.set(key, { mesaNumero: item.mesaNumero, mesaNombre: item.mesaNombre, firstCreatedAt: item.createdAt, items: [] });
    const g = map.get(key)!;
    if (item.createdAt < g.firstCreatedAt) g.firstCreatedAt = item.createdAt;
    g.items.push(item);
  }
  return new Map([...map.entries()].sort((a, b) => a[1].firstCreatedAt.localeCompare(b[1].firstCreatedAt)));
}

type Lang = Parameters<typeof t>[1];

interface CountdownCardProps { item: KitchenItem; remaining: number; lang: Lang; onCancelCountdown: (pedidoId: string, itemIdx: number) => void; }
function CountdownCard({ item, remaining, lang, onCancelCountdown }: Readonly<CountdownCardProps>) {
  return (
    <div className="relative rounded-xl overflow-hidden select-none"
      style={{ background: COUNTDOWN_COLOR.bg, border: `1px solid ${COUNTDOWN_COLOR.border}`, touchAction: 'pan-y' }}>
      <div data-card-content="" className="flex items-center gap-3 px-4 py-4" style={{ background: COUNTDOWN_COLOR.bg }}>
        <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full text-base font-bold"
          style={{ background: 'oklch(32% 0.20 148)', color: 'oklch(80% 0.22 148)', border: '2px solid oklch(55% 0.28 148 / 0.7)' }}>
          {remaining}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{item.cantidad}&times;</span>
            <span className="text-sm font-medium truncate" style={{ color: TEXT_MAIN }}>{item.nombre}</span>
          </div>
          {item.complementos && <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({item.complementos})</span>}
        </div>
        <button className="rounded px-2 py-1 text-[10px] font-bold shrink-0"
          style={{ background: 'oklch(26% 0.08 25)', color: 'oklch(75% 0.18 25)' }}
          onClick={() => onCancelCountdown(item.pedidoId, item.itemIdx)}>
          {t('kitchenCountdownCancel', lang)}
        </button>
      </div>
    </div>
  );
}

interface SwipeCardProps { item: KitchenItem; lang: Lang; onPointerDown: (e: React.PointerEvent, key: string) => void; onPointerMove: (e: React.PointerEvent, key: string) => void; onPointerUp: (e: React.PointerEvent, item: KitchenItem) => void; onPointerCancel: (e: React.PointerEvent) => void; }
function SwipeCard({ item, lang, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: Readonly<SwipeCardProps>) {
  const key      = makeKey(item.pedidoId, item.itemIdx);
  const isEnPrep = item.estado === 'en_preparacion';
  const elapsed  = getElapsedMinutes(item.createdAt);
  const color    = isEnPrep ? EN_PREP_COLOR : getTimeColor(elapsed);
  return (
    <div className="relative rounded-xl overflow-hidden select-none"
      style={{ background: color.bg, border: `1px solid ${color.border}`, touchAction: 'pan-y', willChange: 'transform' }}
      onPointerDown={e => onPointerDown(e, key)}
      onPointerMove={e => onPointerMove(e, key)}
      onPointerUp={e => onPointerUp(e, item)}
      onPointerCancel={onPointerCancel}
    >
      <div data-hint-fwd="" className="absolute inset-0 flex items-center justify-end px-3 rounded-xl pointer-events-none"
        style={{ opacity: 0, background: isEnPrep ? COUNTDOWN_COLOR.bg : EN_PREP_COLOR.bg, transition: 'opacity 0.1s' }}>
        <span className="text-[10px] font-bold" style={{ color: isEnPrep ? 'oklch(78% 0.22 148)' : 'oklch(82% 0.24 90)' }}>
          {isEnPrep ? `\u2713 ${t('kitchenItemListo', lang)}` : `\u2192 ${t('orderStatusAnotado', lang)}`}
        </span>
      </div>
      {isEnPrep && (
        <div data-hint-bck="" className="absolute inset-0 flex items-center px-3 rounded-xl pointer-events-none"
          style={{ opacity: 0, transition: 'opacity 0.1s' }}>
          <span className="text-[10px] font-bold" style={{ color: 'oklch(68% 0.18 240)' }}>
            {`\u2190 ${t('orderStatusPending', lang)}`}
          </span>
        </div>
      )}
      <div data-card-content="" className="flex items-center gap-3 px-4 py-4" style={{ background: color.bg }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{item.cantidad}&times;</span>
            <span className="text-sm font-medium truncate" style={{ color: TEXT_MAIN }}>{item.nombre}</span>
          </div>
          {item.complementos && <span className="text-[10px]" style={{ color: 'oklch(78% 0.03 252)' }}>({item.complementos})</span>}
        </div>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
          style={isEnPrep
            ? { background: 'oklch(32% 0.16 90 / 0.5)', color: 'oklch(82% 0.20 90)' }
            : { background: 'oklch(30% 0.10 252 / 0.4)', color: 'oklch(75% 0.12 252)' }}>
          {isEnPrep ? t('orderStatusAnotado', lang) : t('orderStatusPending', lang)}
        </span>
      </div>
    </div>
  );
}

interface ItemCardProps { item: KitchenItem; countdown: number | undefined; lang: Lang; onPointerDown: (e: React.PointerEvent, key: string) => void; onPointerMove: (e: React.PointerEvent, key: string) => void; onPointerUp: (e: React.PointerEvent, item: KitchenItem) => void; onPointerCancel: (e: React.PointerEvent) => void; onCancelCountdown: (pedidoId: string, itemIdx: number) => void; }
function ItemCard({ item, countdown, lang, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onCancelCountdown }: Readonly<ItemCardProps>) {
  if (countdown !== undefined) {
    return <CountdownCard item={item} remaining={countdown} lang={lang} onCancelCountdown={onCancelCountdown} />;
  }
  return <SwipeCard item={item} lang={lang} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} />;
}

export default function KitchenPage() {
  const { language: lang } = useLanguage();

  const [items, setItems]                             = useState<KitchenItem[]>([]);
  const [countdowns, setCountdowns]                   = useState<Record<string, number>>({});
  const [groupBy]                                     = useState<'order' | 'mesa'>('order');
  const [pendingMergedAction, setPendingMergedAction] = useState<{ items: KitchenItem[]; action: ItemEstado } | null>(null);

  const timersRef      = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const pointerStartX  = useRef<number | null>(null);
  const swipingKey     = useRef<string | null>(null);
  const prevCountRef   = useRef<number | null>(null);
  const instanceId     = useId();
  const channelNameRef = useRef(`kitchen-standalone-${instanceId}`);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    try {
      const r = await fetch('/api/kitchen/items');
      if (!r.ok) return;
      const json = await r.json() as { items: KitchenItem[] };
      const incoming = json.items ?? [];
      const activeCount = incoming.filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion').length;
      if (prevCountRef.current !== null && activeCount > prevCountRef.current) playBell();
      prevCountRef.current = activeCount;
      setItems(incoming);
    } catch { /* ignore */ }
  }, []);

  // Push notification foreground: play bell + refresh (dispatched by PushRegistrar when role=kitchen)
  useEffect(() => {
    function onPushReceived() { void fetchItems(); }
    globalThis.window?.addEventListener('kitchen-push-received', onPushReceived);
    return () => globalThis.window?.removeEventListener('kitchen-push-received', onPushReceived);
  }, [fetchItems]);

  // Realtime: react to changes in pedido_item_estados + new pedidos
  useEffect(() => {
    void fetchItems();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void fetchItems(); }, 100);
    }

    // postgres_changes — catches direct DB mutations (unique name avoids StrictMode stale-channel bug)
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, scheduleRefresh)
      .subscribe();

    // Broadcast channels — fired by DB triggers; catches validation events that postgres_changes may miss
    const broadcastItems = supabase
      .channel('waiter-items-update')
      .on('broadcast', { event: 'item-update' }, scheduleRefresh)
      .subscribe();

    const broadcastOrders = supabase
      .channel('waiter-new-order-kitchen')
      .on('broadcast', { event: 'new-order' }, scheduleRefresh)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(broadcastItems);
      void supabase.removeChannel(broadcastOrders);
    };
  }, [fetchItems]);

  // Visual timer tick — no network calls
  useEffect(() => {
    const tick = setInterval(() => setItems(p => [...p]), 1000);
    return () => clearInterval(tick);
  }, []);

  // Cleanup countdown intervals on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(id => clearInterval(id)); };
  }, []);

  // ── Countdown ──────────────────────────────────────────────────────────────

  const applyItemListo = useCallback((pedidoId: string, itemIdx: number) => {
    void fetch(`/api/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'listo' }),
    }).then(r => {
      if (r.ok) setItems(prev => prev.filter(notMatchingItem(pedidoId, itemIdx)));
    });
  }, []);

  const startCountdown = useCallback((pedidoId: string, itemIdx: number) => {
    const key = makeKey(pedidoId, itemIdx);
    if (timersRef.current.has(key)) return;
    let remaining = COUNTDOWN_SECONDS;
    setCountdowns(prev => ({ ...prev, [key]: remaining }));
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        timersRef.current.delete(key);
        setCountdowns(prev => { const next = { ...prev }; delete next[key]; return next; });
        applyItemListo(pedidoId, itemIdx);
      } else {
        setCountdowns(prev => ({ ...prev, [key]: remaining }));
      }
    }, 1000);
    timersRef.current.set(key, interval);
  }, [applyItemListo]);

  const cancelCountdown = useCallback((pedidoId: string, itemIdx: number) => {
    const key = makeKey(pedidoId, itemIdx);
    const interval = timersRef.current.get(key);
    if (interval) clearInterval(interval);
    timersRef.current.delete(key);
    setCountdowns(prev => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  // ── PATCH ──────────────────────────────────────────────────────────────────

  const patchEstado = useCallback(async (pedidoId: string, itemIdx: number, estado: ItemEstado) => {
    const r = await fetch(`/api/kitchen/items/${encodeURIComponent(pedidoId)}/${itemIdx}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    if (r.ok) void fetchItems();
  }, [fetchItems]);

  const confirmMergedAction = useCallback(async () => {
    if (!pendingMergedAction) return;
    const { items: targets, action } = pendingMergedAction;
    setPendingMergedAction(null);
    await Promise.all(targets.map(i => patchEstado(i.pedidoId, i.itemIdx, action)));
  }, [pendingMergedAction, patchEstado]);

  // ── Swipe handlers ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent, key: string) => {
    pointerStartX.current = e.clientX;
    swipingKey.current = key;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, key: string) => {
    if (swipingKey.current !== key || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    const el = e.currentTarget as HTMLElement;
    const content = el.querySelector<HTMLElement>('[data-card-content]');
    if (content) { content.style.transform = `translateX(${delta}px)`; content.style.transition = 'none'; }
    const hintFwd = el.querySelector<HTMLElement>('[data-hint-fwd]');
    const hintBck = el.querySelector<HTMLElement>('[data-hint-bck]');
    if (hintFwd) hintFwd.style.opacity = delta < 0 ? String(Math.min(1, -delta / THRESHOLD)) : '0';
    if (hintBck) hintBck.style.opacity = delta > 0 ? String(Math.min(1, delta / THRESHOLD)) : '0';
  }, []);

  const snapCard = useCallback((el: HTMLElement) => {
    const content = el.querySelector<HTMLElement>('[data-card-content]');
    const hintFwd = el.querySelector<HTMLElement>('[data-hint-fwd]');
    const hintBck = el.querySelector<HTMLElement>('[data-hint-bck]');
    if (content) { content.style.transform = 'translateX(0)'; content.style.transition = 'transform 0.2s'; }
    if (hintFwd) hintFwd.style.opacity = '0';
    if (hintBck) hintBck.style.opacity = '0';
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent, item: KitchenItem) => {
    if (swipingKey.current !== makeKey(item.pedidoId, item.itemIdx) || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    pointerStartX.current = null;
    swipingKey.current = null;
    snapCard(e.currentTarget as HTMLElement);

    if (delta < -THRESHOLD) {
      if (item.estado === 'pendiente') void patchEstado(item.pedidoId, item.itemIdx, 'en_preparacion');
      else if (item.estado === 'en_preparacion') startCountdown(item.pedidoId, item.itemIdx);
    } else if (delta > THRESHOLD && item.estado === 'en_preparacion') {
      void patchEstado(item.pedidoId, item.itemIdx, 'pendiente');
    }
  }, [patchEstado, snapCard, startCountdown]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    pointerStartX.current = null;
    swipingKey.current = null;
    snapCard(e.currentTarget as HTMLElement);
  }, [snapCard]);

  const handlePointerUpMerged = useCallback((e: React.PointerEvent, merged: MergedItem) => {
    if (swipingKey.current !== merged.mergeKey || pointerStartX.current === null) return;
    const delta = e.clientX - pointerStartX.current;
    pointerStartX.current = null;
    swipingKey.current = null;
    snapCard(e.currentTarget as HTMLElement);

    const isEnPrep = merged.estado === 'en_preparacion';
    if (delta > THRESHOLD && isEnPrep) {
      setPendingMergedAction({ items: merged.items, action: 'pendiente' });
    } else {
      setPendingMergedAction({ items: merged.items, action: isEnPrep ? 'listo' : 'en_preparacion' });
    }
  }, [snapCard]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const activeItems = items.filter(i => i.estado === 'pendiente' || i.estado === 'en_preparacion');
  const grouped     = (groupBy === 'mesa' ? groupByMesa(activeItems) : groupByPedido(activeItems)) as Map<string, AnyGroupValue>;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG, color: TEXT_MAIN }}>

      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-4 pb-3 flex items-center gap-3" style={{ background: BG, borderBottom: '1px solid oklch(28% 0.06 252 / 0.5)' }}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: 'oklch(26% 0.12 252)' }}>
          <UtensilsCrossed className="w-5 h-5" style={{ color: 'oklch(72% 0.18 252)' }} />
        </div>
        <span className="text-lg font-bold" style={{ color: TEXT_MAIN }}>Cocina</span>
        {activeItems.length > 0 && (
          <span className="text-sm font-bold px-2.5 py-0.5 rounded-full" style={{ background: 'oklch(26% 0.14 35)', color: 'oklch(78% 0.22 35)' }}>
            {activeItems.length}
          </span>
        )}
        <button
          type="button"
          onClick={() => { void fetch('/api/waiter/logout', { method: 'POST' }).then(() => { globalThis.location.reload(); }); }}
          className="ml-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ background: 'oklch(20% 0.06 252)', color: TEXT_DIM, border: '1px solid oklch(32% 0.08 252 / 0.5)' }}
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-6">

        {/* Empty state */}
        {activeItems.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <UtensilsCrossed className="w-10 h-10" style={{ color: 'oklch(38% 0.08 252)' }} />
            <span className="text-sm" style={{ color: TEXT_DIM }}>Sin ítems pendientes</span>
          </div>
        )}

        {/* Per-order view */}
        {Array.from(grouped.entries()).map(([groupKey, group]) => {
          const isOrderGroup = groupBy === 'order';
          const numeroPedido: number | null = 'numeroPedido' in group ? group.numeroPedido : null;
          const createdAt: string = 'createdAt' in group ? group.createdAt : group.firstCreatedAt;
          const label        = group.mesaNombre ?? (group.mesaNumero === null ? groupKey : `Mesa ${group.mesaNumero}`);
          const elapsed      = getElapsedMinutes(createdAt);

          return (
            <div key={groupKey}>
              <div className="flex items-center gap-2 px-1 mb-2">
                {isOrderGroup && numeroPedido !== null && (
                  <span className="text-xs font-bold" style={{ color: 'oklch(72% 0.14 62)' }}>#{numeroPedido}</span>
                )}
                <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{label}</span>
                <span className="text-[10px] font-mono ml-auto" style={{ color: TEXT_DIM }}>{formatTimer(elapsed)}</span>
              </div>

              <div className="flex flex-col gap-2">
                {group.items.map(item => {
                  const key = makeKey(item.pedidoId, item.itemIdx);
                  return (
                    <ItemCard
                      key={key}
                      item={item}
                      countdown={countdowns[key]}
                      lang={lang}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onCancelCountdown={cancelCountdown}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

      </div>

      {/* Merged group confirmation dialog */}
      {pendingMergedAction && (
        <dialog open className="fixed inset-0 z-50 flex items-center justify-center px-6 m-0 p-0 max-w-none max-h-none w-full h-full border-0"
          style={{ background: 'oklch(0% 0 0 / 0.72)' }}>
          <div className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'oklch(16% 0.04 252)', border: '1px solid oklch(45% 0.12 252 / 0.5)' }}>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>
                {`Marcar como ${getMergedActionLabel(pendingMergedAction.action)}`}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: TEXT_DIM }}>
                {`Se actualizar\u00e1n ${pendingMergedAction.items.length} ${pendingMergedAction.items.length === 1 ? '\u00edtem' : '\u00edtems'} del mismo plato.`}
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
                style={{
                  background: pendingMergedAction.action === 'listo' ? 'oklch(28% 0.16 148)' : 'oklch(28% 0.16 90)',
                  color:      pendingMergedAction.action === 'listo' ? 'oklch(82% 0.22 148)' : 'oklch(85% 0.20 90)',
                  border:     pendingMergedAction.action === 'listo' ? '1px solid oklch(50% 0.28 148 / 0.6)' : '1px solid oklch(55% 0.28 90 / 0.6)',
                }}
              >
                {t('kitchenConfirmProcess', lang)}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
