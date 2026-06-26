"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { UtensilsCrossed, ArrowLeftRight, LogOut, X, ShoppingCart, ChevronDown, Circle, LockOpen, AlertTriangle, Wine, BellRing } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { getWaiterMesa, clearWaiterMesa, saveWaiterMesa } from "@/components/waiter-login-form";
import { useCart } from "@/lib/cart-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BG            = "oklch(17% 0.025 252)";
const BORDER        = "oklch(42% 0.14 62 / 0.35)";
const TEXT_DIM      = "oklch(52% 0.05 252)";
const TEXT_MAIN     = "oklch(92% 0.02 252)";
const DOT_COLOR     = "oklch(70% 0.19 148)";

// Cart — amber/warm neutral
const BTN_CART_BG    = "oklch(22% 0.04 62)";
const BTN_CART_HOVER = "oklch(28% 0.07 62)";
const BTN_CART_TEXT  = "oklch(72% 0.14 62)";

// Change table — blue/indigo
const BTN_TABLE_BG    = "oklch(20% 0.04 255)";
const BTN_TABLE_HOVER = "oklch(26% 0.07 255)";
const BTN_TABLE_TEXT  = "oklch(68% 0.14 255)";

// Close table — amber/orange (warning)
const BTN_CLOSE_BG    = "oklch(20% 0.05 45)";
const BTN_CLOSE_HOVER = "oklch(26% 0.08 45)";
const BTN_CLOSE_TEXT  = "oklch(70% 0.18 45)";

// Logout — red (destructive/exit)
const BTN_EXIT_BG    = "oklch(20% 0.05 25)";
const BTN_EXIT_HOVER = "oklch(26% 0.08 25)";
const BTN_EXIT_TEXT  = "oklch(66% 0.18 25)";

// Unlock payment — orange (warning/action)
const BTN_UNLOCK_BG    = "oklch(22% 0.07 40)";
const BTN_UNLOCK_HOVER = "oklch(28% 0.11 40)";
const BTN_UNLOCK_TEXT  = "oklch(75% 0.20 40)";

// Llamadas — golden amber
const BTN_LLAMADAS_BG    = "oklch(22% 0.12 55)";
const BTN_LLAMADAS_HOVER = "oklch(28% 0.17 55)";
const BTN_LLAMADAS_TEXT  = "oklch(82% 0.24 55)";

// Pendientes — warm red/orange
const BTN_PENDIENTES_BG    = "oklch(22% 0.12 35)";
const BTN_PENDIENTES_HOVER = "oklch(28% 0.16 35)";
const BTN_PENDIENTES_TEXT  = "oklch(75% 0.22 35)";

// Kitchen — warm amber
const BTN_KITCHEN_BG    = "oklch(22% 0.07 62)";
const BTN_KITCHEN_HOVER = "oklch(28% 0.10 62)";
const BTN_KITCHEN_TEXT  = "oklch(72% 0.14 62)";

// Bar — cool indigo
const BTN_BAR_BG    = "oklch(20% 0.06 252)";
const BTN_BAR_HOVER = "oklch(26% 0.09 252)";
const BTN_BAR_TEXT  = "oklch(68% 0.14 252)";

// Dropdown
const DD_BG        = "oklch(19% 0.025 252)";
const DD_BORDER    = "oklch(38% 0.10 252 / 0.5)";
const DD_ITEM_HV   = "oklch(24% 0.035 252)";
const DD_ITEM_ACT  = "oklch(22% 0.06 255 / 0.6)";

interface Mesa {
  id: string;
  numero: number;
  nombre: string | null;
  sesionId: string | null;
}

type CountsPayload = {
  cocina: { total: number; listos: number; retenidos: number };
  bebidas: { total: number; listos: number; retenidos: number };
  pendientes: number;
  llamadas?: number;
};

function didCountsIncrease(prev: CountsPayload, next: CountsPayload): boolean {
  const totalUp = next.cocina.total > prev.cocina.total || next.bebidas.total > prev.bebidas.total;
  const listosUp = next.cocina.listos > prev.cocina.listos || next.bebidas.listos > prev.bebidas.listos;
  const pendientesUp = next.pendientes > (prev.pendientes ?? 0);
  const llamadasUp = (next.llamadas ?? 0) > (prev.llamadas ?? 0);
  return totalUp || listosUp || pendientesUp || llamadasUp;
}

function playNotificationSound() {
  try {
    const audio = new Audio('/bell.mp3');
    audio.volume = 0.7;
    void audio.play();
  } catch { /* audio not available */ }
}

async function handleLogout() {
  await fetch("/api/waiter/logout", { method: "POST" });
  clearWaiterMesa();
  globalThis.location.href = "/waiter";
}

export function WaiterBanner() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const { language: lang } = useLanguage();
  const { openCart, totalItems, clearCart } = useCart();
  const [closeDialog, setCloseDialog] = useState<'confirm' | 'cart' | 'payment' | 'unpaid' | 'free' | null>(null);

  const [mesaLabel, setMesaLabel]     = useState<string | null>(null);
  const [mesaId, setMesaId]           = useState<string | null>(null);
  const [closing, setClosing]         = useState(false);
  const [closeError, setCloseError]   = useState<string | null>(null);
  const [pagoEnCurso, setPagoEnCurso] = useState(false);
  const [unlocking, setUnlocking]     = useState(false);

  // Waiter auth — independent of mesa selection
  const [isWaiter, setIsWaiter]       = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Kitchen/bar badge counts
  const [counts, setCounts] = useState<CountsPayload | null>(null);
  const prevCountsRef = useRef<CountsPayload | null>(null);

  // Table dropdown
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [mesas, setMesas]                 = useState<Mesa[]>([]);
  const [loadingMesas, setLoadingMesas]   = useState(false);
  const [switchingId, setSwitchingId]     = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Check waiter auth on mount and path change
  useEffect(() => {
    fetch('/api/waiter/me')
      .then(r => { setIsWaiter(r.ok); })
      .catch(() => setIsWaiter(false))
      .finally(() => setAuthChecked(true));
  }, [pathname]);

  // Re-check auth when login form signals a successful PIN entry
  useEffect(() => {
    function handleAuthChanged() {
      fetch('/api/waiter/me')
        .then(r => { setIsWaiter(r.ok); })
        .catch(() => setIsWaiter(false))
        .finally(() => setAuthChecked(true));
    }
    window.addEventListener('waiter-auth-changed', handleAuthChanged);
    return () => window.removeEventListener('waiter-auth-changed', handleAuthChanged);
  }, []);

  // Session expired on a waiter sub-page → back to PIN
  useEffect(() => {
    if (!authChecked || isWaiter) return;
    if (pathname.startsWith('/waiter/')) {
      globalThis.location.href = '/waiter';
    }
  }, [authChecked, isWaiter, pathname]);

  useEffect(() => {
    const stored = getWaiterMesa();
    if (!stored) { setMesaLabel(null); setMesaId(null); return; }

    fetch("/api/waiter/me")
      .then((r) => {
        if (r.ok) {
          setMesaLabel(stored.mesaNombre ?? `Mesa ${stored.mesaNumero}`);
          setMesaId(stored.mesaId);
        } else {
          clearWaiterMesa();
          setMesaLabel(null);
          setMesaId(null);
        }
      })
      .catch(() => null);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Poll lock status
  const fetchLock = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/mesas/${encodeURIComponent(id)}/lock`);
      if (r.ok) {
        const json = await r.json() as { pago_en_curso: boolean };
        setPagoEnCurso(json.pago_en_curso);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!mesaId) { setPagoEnCurso(false); return; }
    void fetchLock(mesaId);
  }, [mesaId, fetchLock]);

  // Realtime: kitchen/bar counts + lock status via single multiplexed channel
  useEffect(() => {
    if (!isWaiter) return;
    const fetchCounts = async () => {
      try {
        const r = await fetch('/api/waiter/orders/counts');
        if (r.status === 401) { setIsWaiter(false); return; }
        if (!r.ok) return;
        const json = await r.json() as CountsPayload;
        const prev = prevCountsRef.current;
        if (prev && pathnameRef.current.startsWith('/waiter') && didCountsIncrease(prev, json)) {
          playNotificationSound();
        }
        prevCountsRef.current = json;
        setCounts(json);
      } catch { /* ignore */ }
    };
    void fetchCounts();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('waiter-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_item_estados' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void fetchCounts(); }, 100);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones' }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void fetchCounts();
          if (mesaId) void fetchLock(mesaId);
        }, 100);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-banner error:', status);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [isWaiter, mesaId, fetchLock]);

  // ── helper functions ──────────────────────────────────

  async function handleToggleDropdown() {
    if (dropdownOpen) { setDropdownOpen(false); return; }
    setLoadingMesas(true);
    setDropdownOpen(true);
    try {
      const r = await fetch("/api/waiter/mesas");
      if (r.ok) {
        const json = await r.json() as { mesas: Mesa[] };
        setMesas(json.mesas ?? []);
      }
    } finally {
      setLoadingMesas(false);
    }
  }

  async function handleSelectTable(mesa: Mesa) {
    if (switchingId) return;
    setSwitchingId(mesa.id);
    try {
      if (!mesa.sesionId) {
        const r = await fetch(`/api/waiter/mesas/${encodeURIComponent(mesa.id)}/open`, { method: "POST" });
        if (!r.ok) { setSwitchingId(null); return; }
      }
      saveWaiterMesa({ mesaId: mesa.id, mesaNumero: mesa.numero, mesaNombre: mesa.nombre });
      setDropdownOpen(false);
      globalThis.location.href = `/?mesa=${mesa.id}`;
    } finally {
      setSwitchingId(null);
    }
  }

  async function doCloseTable() {
    if (!mesaId || closing) return;
    setCloseDialog(null);
    setClosing(true);
    setCloseError(null);
    try {
      const res = await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/close`, { method: "POST" });
      if (res.ok || res.status === 404) {
        clearWaiterMesa();
        globalThis.location.href = "/waiter";
      } else {
        setCloseError(t("waiterTableCloseError", lang));
        setTimeout(() => { setCloseError(null); }, 5000);
      }
    } finally {
      setClosing(false);
    }
  }

  async function handleCloseTable() {
    if (!mesaId || closing) return;
    if (pagoEnCurso) { setCloseDialog('payment'); return; }
    if (totalItems > 0) { setCloseDialog('cart'); return; }
    try {
      const r = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (r.ok) {
        const data = await r.json() as { orders: unknown[]; pagosHabilitados: boolean; sesionPagada: boolean };
        if (data.orders.length === 0) { setCloseDialog('free'); return; }
        if (data.pagosHabilitados && !data.sesionPagada) {
          setCloseDialog('unpaid');
          return;
        }
      }
    } catch { /* best-effort */ }
    setCloseDialog('confirm');
  }

  async function handleClearCartAndContinue() {
    clearCart();
    setCloseDialog(null);
    if (!mesaId) return;
    try {
      const r = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (r.ok) {
        const data = await r.json() as { orders: unknown[]; pagosHabilitados: boolean; sesionPagada: boolean };
        if (data.pagosHabilitados && !data.sesionPagada && data.orders.length > 0) {
          setCloseDialog('unpaid');
          return;
        }
      }
    } catch { /* best-effort */ }
    setCloseDialog('confirm');
  }

  async function handleUnlockPayment() {
    if (!mesaId || unlocking) return;
    setUnlocking(true);
    try {
      await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/lock`, { method: "DELETE" });
      setPagoEnCurso(false);
    } finally {
      setUnlocking(false);
    }
  }

  // Not ready yet
  if (!authChecked) return null;

  // Not a waiter at all → hide everything
  if (!isWaiter) return null;

  // Admin/superadmin panels are never waiter context
  if (pathname.startsWith('/admin') || pathname.startsWith('/superadmin')) return null;

  // Kitchen page has its own header — don't render the waiter banner there

  // Tracking page is customer-facing — never show the waiter banner there
  if (pathname.startsWith('/tracking/')) return null;

  const hasMesa = mesaLabel !== null;

  // Customer-facing pages — hide banner unless the waiter is impersonating a mesa
  if (pathname.startsWith('/mesa/') && !hasMesa) return null;

  let sectionLabel: string | null = null;
  if (pathname === '/waiter/kitchen') sectionLabel = t('waiterKitchen', lang);
  else if (pathname === '/waiter/bar') sectionLabel = t('waiterBar', lang);

  function renderDropdownContent() {
    if (loadingMesas) {
      return (
        <div className="px-4 py-3 text-xs" style={{ color: TEXT_DIM }}>
          Cargando…
        </div>
      );
    }
    if (mesas.length === 0) {
      return (
        <div className="px-4 py-3 text-xs" style={{ color: TEXT_DIM }}>
          Sin mesas disponibles
        </div>
      );
    }
    return (
      <ul className="py-1 max-h-64 overflow-y-auto">
        <li>
          <button
            onClick={() => { setDropdownOpen(false); globalThis.location.href = "/waiter"; }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors duration-100 border-b"
            style={{
              color: BTN_TABLE_TEXT,
              backgroundColor: "transparent",
              borderColor: DD_BORDER,
            }}
            onMouseEnter={e => { (e.currentTarget.style.backgroundColor = DD_ITEM_HV); }}
            onMouseLeave={e => { (e.currentTarget.style.backgroundColor = "transparent"); }}
          >
            <ArrowLeftRight className="w-3 h-3 shrink-0" />
            <span className="flex-1 truncate">{t("waiterViewAllTables", lang)}</span>
          </button>
        </li>
        {mesas.filter(m => m.id !== mesaId).map((mesa) => {
          const isOpen = mesa.sesionId !== null;
          const label  = mesa.nombre ?? `Mesa ${mesa.numero}`;
          const busy   = switchingId === mesa.id;
          return (
            <li key={mesa.id}>
              <button
                onClick={() => handleSelectTable(mesa)}
                disabled={busy}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-100 disabled:opacity-60"
                style={{ color: TEXT_MAIN, backgroundColor: "transparent" }}
                onMouseEnter={e => { (e.currentTarget.style.backgroundColor = DD_ITEM_HV); }}
                onMouseLeave={e => { (e.currentTarget.style.backgroundColor = "transparent"); }}
              >
                <Circle
                  className="w-2 h-2 shrink-0 fill-current"
                  style={{ color: isOpen ? DOT_COLOR : "oklch(38% 0.04 252)" }}
                />
                <span className="flex-1 truncate font-medium">{label}</span>
                {isOpen && (
                  <span className="text-[9px]" style={{ color: TEXT_DIM }}>abierta</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  // On the customer store page, only show the banner if the waiter has a mesa selected.
  // Without a mesa in sessionStorage we're in customer context — hide the waiter UI.
  if (pathname === '/' && !hasMesa) return null;

  return (
    <>
      <div aria-hidden className="h-12" />
      {closeError && (
        <div
          role="alert"
          className="fixed top-12 left-0 right-0 z-[100] px-4 py-2 text-xs text-center font-medium"
          style={{ background: "oklch(25% 0.08 25)", color: "oklch(88% 0.10 25)" }}
        >
          {closeError}
        </div>
      )}
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[200] flex h-12 items-center justify-between px-4 shadow-lg"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}`, pointerEvents: 'all' }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Left: section label (Cocina/Bar) and/or mesa name */}
        <div className="flex items-center gap-1.5 min-w-0">
          {sectionLabel && (
            <div className="flex items-center gap-1.5 px-2 py-1 shrink-0">
              {pathname === '/waiter/bar'
                ? <Wine className="w-3.5 h-3.5 shrink-0" style={{ color: BTN_BAR_TEXT }} />
                : <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" style={{ color: BTN_KITCHEN_TEXT }} />
              }
              <span className="text-sm font-bold" style={{ color: TEXT_MAIN }}>{sectionLabel}</span>
            </div>
          )}
          {hasMesa ? (
            <button
              className="flex items-center gap-1.5 min-w-0 rounded-md px-2 py-1 transition-colors duration-150"
              style={{ backgroundColor: 'oklch(22% 0.06 148 / 0.5)', border: '1px solid oklch(45% 0.18 148 / 0.4)' }}
              onClick={() => { globalThis.location.href = `/?mesa=${mesaId ?? ''}`; }}
              aria-label={mesaLabel ?? undefined}
            >
              {!sectionLabel && <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT_DIM }} />}
              {/* Active indicator */}
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'oklch(68% 0.26 148)', boxShadow: '0 0 4px oklch(68% 0.26 148 / 0.7)' }} />
              <span className="text-xs font-semibold truncate" style={{ color: 'oklch(82% 0.14 148)' }}>{mesaLabel}</span>
            </button>
          ) : !sectionLabel && (
            <div className="flex items-center px-2">
              <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT_DIM }} />
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Cart — only when mesa selected and not on waiter/kitchen/bar pages */}
          {hasMesa && pathname !== '/waiter' && pathname !== '/waiter/pendientes' && pathname !== '/waiter/kitchen' && pathname !== '/waiter/bar' && (
            <button
              onClick={openCart}
              className="relative flex items-center justify-center rounded-md p-2 transition-colors duration-150 min-h-[32px] min-w-[32px]"
              style={{ color: BTN_CART_TEXT, backgroundColor: BTN_CART_BG }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_CART_HOVER)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_CART_BG)}
              aria-label={t("openCart", lang)}
            >
              <ShoppingCart className="w-4 h-4 shrink-0" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold text-destructive-foreground">
                  {totalItems}
                </span>
              )}
            </button>
          )}

          {/* Llamadas — visual indicator only, no action */}
          {counts && (counts.llamadas ?? 0) > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium min-h-[32px] pointer-events-none select-none"
              style={{ color: BTN_LLAMADAS_TEXT, backgroundColor: BTN_LLAMADAS_BG }}
              aria-label="Llamadas de mesa"
            >
              <BellRing className="w-3.5 h-3.5 shrink-0 animate-pulse" />
              <span
                className="text-[10px] font-bold"
                style={{
                  background: BTN_LLAMADAS_TEXT,
                  color: 'oklch(15% 0.05 55)',
                  borderRadius: '9999px',
                  padding: '1px 6px',
                  minWidth: 16,
                  textAlign: 'center',
                }}
              >
                {counts.llamadas}
              </span>
            </div>
          )}

          {/* Pendientes — visible only when there are items awaiting validation */}
          {counts && counts.pendientes > 0 && (
            <button
              onClick={() => { globalThis.location.href = '/waiter/pendientes'; }}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
              style={{ color: BTN_PENDIENTES_TEXT, backgroundColor: BTN_PENDIENTES_BG }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_PENDIENTES_HOVER)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_PENDIENTES_BG)}
              aria-label={t('pendientesTitle', lang)}
            >
              <span className="text-[10px] font-bold" style={{
                background: 'oklch(55% 0.30 25)', color: '#fff',
                borderRadius: '9999px', padding: '1px 6px', minWidth: 16, textAlign: 'center',
              }}>
                {counts.pendientes}
              </span>
              <span className="hidden sm:inline">{t('pendientesTitle', lang)}</span>
            </button>
          )}

          {/* Kitchen — always visible for authenticated waiters */}
          <button
            onClick={() => { globalThis.location.href = '/waiter/kitchen'; }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
            style={{ color: BTN_KITCHEN_TEXT, backgroundColor: BTN_KITCHEN_BG }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_KITCHEN_HOVER)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_KITCHEN_BG)}
            aria-label={t("waiterKitchen", lang)}
          >
            <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
            {counts && (
              <div className="flex items-center gap-0.5">
                <BadgeCircle count={counts.cocina.total} color="neutral" />
                <BadgeCircle count={counts.cocina.listos} color="green" />
                <BadgeCircle count={counts.cocina.retenidos} color="orange" />
              </div>
            )}
          </button>

          {/* Bar — always visible for authenticated waiters */}
          <button
            onClick={() => { globalThis.location.href = '/waiter/bar'; }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
            style={{ color: BTN_BAR_TEXT, backgroundColor: BTN_BAR_BG }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_BAR_HOVER)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_BAR_BG)}
            aria-label={t("waiterBar", lang)}
          >
            <Wine className="w-3.5 h-3.5 shrink-0" />
            {counts && (
              <div className="flex items-center gap-0.5">
                <BadgeCircle count={counts.bebidas.total} color="neutral" />
                <BadgeCircle count={counts.bebidas.listos} color="green" />
                <BadgeCircle count={counts.bebidas.retenidos} color="orange" />
              </div>
            )}
          </button>

          {/* Change table — dropdown trigger */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleToggleDropdown}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
              style={{ color: BTN_TABLE_TEXT, backgroundColor: BTN_TABLE_BG }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_TABLE_HOVER)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_TABLE_BG)}
              aria-label={t("waiterChangeTable", lang)}
              aria-expanded={dropdownOpen}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("waiterChangeTable", lang)}</span>
              <ChevronDown
                className={`w-3 h-3 shrink-0 transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown */}
            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-1 w-52 rounded-lg shadow-xl overflow-hidden z-[101]"
                style={{ background: DD_BG, border: `1px solid ${DD_BORDER}` }}
              >
                {renderDropdownContent()}
              </div>
            )}
          </div>

          {/* Unlock payment — visible only when pago_en_curso */}
          {pagoEnCurso && (
            <button
              onClick={handleUnlockPayment}
              disabled={unlocking}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px] disabled:opacity-40"
              style={{ color: BTN_UNLOCK_TEXT, backgroundColor: BTN_UNLOCK_BG }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_UNLOCK_HOVER)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_UNLOCK_BG)}
              aria-label={t("waiterUnlockPayment", lang)}
            >
              <LockOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("waiterUnlockPayment", lang)}</span>
            </button>
          )}

          {/* Close table — only when mesa selected */}
          {hasMesa && (
            <button
              onClick={handleCloseTable}
              disabled={closing}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px] disabled:opacity-40"
              style={{ color: BTN_CLOSE_TEXT, backgroundColor: BTN_CLOSE_BG }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_CLOSE_HOVER)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_CLOSE_BG)}
              aria-label={t("waiterTableCloseAction", lang)}
            >
              <X className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("waiterTableCloseAction", lang)}</span>
            </button>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
            style={{ color: BTN_EXIT_TEXT, backgroundColor: BTN_EXIT_BG }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_EXIT_HOVER)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_EXIT_BG)}
            aria-label={t("waiterLogout", lang)}
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{t("waiterLogout", lang)}</span>
          </button>

        </div>
      </div>

      {/* Mesa already free */}
      <Dialog open={closeDialog === 'free'} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-green-500" />
              Mesa libre
            </DialogTitle>
            <DialogDescription className="pt-2">
              Esta mesa ya está libre y no tiene pedidos activos. No es necesario cerrar la sesión.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button className="flex-1" onClick={() => setCloseDialog(null)}>Entendido</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Close table dialogs */}
      <Dialog open={closeDialog === 'payment'} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Pago en curso
            </DialogTitle>
            <DialogDescription className="pt-2">
              Hay un pago en proceso en esta mesa. Esperá a que se complete o desbloqueá el pago antes de cerrarla.
            </DialogDescription>
          </DialogHeader>
          <Button className="w-full mt-2" onClick={() => setCloseDialog(null)}>Entendido</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog === 'cart'} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Hay ítems pendientes
            </DialogTitle>
            <DialogDescription className="pt-2">
              El carrito tiene pedidos sin enviar. Elimínalos para continuar con el cierre de la mesa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setCloseDialog(null)}>Volver</Button>
            <Button variant="destructive" className="flex-1" onClick={() => void handleClearCartAndContinue()}>Eliminar pedidos</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog === 'unpaid'} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Pago pendiente
            </DialogTitle>
            <DialogDescription className="pt-2">
              Hay pedidos pendientes de pago. Ve al ticket para registrar el pago manual antes de cerrar la mesa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setCloseDialog(null)}>Volver</Button>
            <Button className="flex-1" onClick={() => { setCloseDialog(null); globalThis.location.href = `/mesa/${mesaId}/orders`; }}>
              Ver ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog === 'confirm'} onOpenChange={() => setCloseDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("waiterTableCloseConfirm", lang)}</DialogTitle>
            <DialogDescription className="pt-2">
              Se cerrará la sesión activa de la mesa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={() => setCloseDialog(null)}>{t("cancel", lang)}</Button>
            <Button variant="destructive" className="flex-1" onClick={() => void doCloseTable()} disabled={closing}>
              {closing ? "Cerrando…" : t("waiterTableCloseAction", lang)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BadgeCircle({ count, color }: Readonly<{ count: number; color: 'neutral' | 'green' | 'orange' }>) {
  if (count === 0) return null;
  const colors = {
    neutral: { bg: 'oklch(45% 0.04 252)', text: 'oklch(90% 0.02 252)' },
    green:   { bg: 'oklch(35% 0.18 148)', text: 'oklch(88% 0.18 148)' },
    orange:  { bg: 'oklch(35% 0.18 62)',  text: 'oklch(88% 0.18 62)'  },
  };
  const c = colors[color];
  return (
    <span
      className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {count}
    </span>
  );
}
