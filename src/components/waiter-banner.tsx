"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { UtensilsCrossed, ArrowLeftRight, LogOut, X, ShoppingCart, ChevronDown, Circle } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { getWaiterMesa, clearWaiterMesa, saveWaiterMesa } from "@/components/waiter-login-form";
import { useCart } from "@/lib/cart-context";

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

export function WaiterBanner() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const { openCart, totalItems } = useCart();

  const [mesaLabel, setMesaLabel] = useState<string | null>(null);
  const [mesaId, setMesaId]       = useState<string | null>(null);
  const [closing, setClosing]     = useState(false);

  // Table dropdown
  const [dropdownOpen, setDropdownOpen]   = useState(false);
  const [mesas, setMesas]                 = useState<Mesa[]>([]);
  const [loadingMesas, setLoadingMesas]   = useState(false);
  const [switchingId, setSwitchingId]     = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  if (!mesaLabel) return null;

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
      setMesaId(mesa.id);
      setMesaLabel(mesa.nombre ?? `Mesa ${mesa.numero}`);
      setDropdownOpen(false);
    } finally {
      setSwitchingId(null);
    }
  }

  async function handleCloseTable() {
    if (!mesaId || closing) return;
    if (!window.confirm(t("waiterTableCloseConfirm", lang))) return;
    setClosing(true);
    try {
      await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/close`, { method: "POST" });
      clearWaiterMesa();
      window.location.href = "/waiter";
    } finally {
      setClosing(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/waiter/logout", { method: "POST" });
    clearWaiterMesa();
    window.location.href = "/waiter";
  }

  return (
    <>
      <div aria-hidden className="h-12" />
      <div
        role="status"
        aria-live="polite"
        className="fixed top-0 left-0 right-0 z-[100] flex h-12 items-center justify-between px-4 shadow-lg"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        {/* Left: live dot + icon + labels */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ backgroundColor: DOT_COLOR }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: DOT_COLOR }}
            />
          </span>

          <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" style={{ color: TEXT_DIM }} />

          <span
            className="hidden xs:inline text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
            style={{ color: TEXT_DIM }}
          >
            {t("waiterModeActive", lang)}
          </span>

          <span className="hidden xs:inline text-[10px]" style={{ color: TEXT_DIM }}>·</span>

          <span className="text-sm font-bold truncate" style={{ color: TEXT_MAIN }}>
            {mesaLabel}
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">

          {/* Cart */}
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
                {loadingMesas ? (
                  <div className="px-4 py-3 text-xs" style={{ color: TEXT_DIM }}>
                    Cargando…
                  </div>
                ) : mesas.length === 0 ? (
                  <div className="px-4 py-3 text-xs" style={{ color: TEXT_DIM }}>
                    Sin mesas disponibles
                  </div>
                ) : (
                  <ul className="py-1 max-h-64 overflow-y-auto">
                    {mesas.map((mesa) => {
                      const isActive = mesa.id === mesaId;
                      const isOpen   = mesa.sesionId !== null;
                      const label    = mesa.nombre ?? `Mesa ${mesa.numero}`;
                      const busy     = switchingId === mesa.id;
                      return (
                        <li key={mesa.id}>
                          <button
                            onClick={() => handleSelectTable(mesa)}
                            disabled={busy || isActive}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-100 disabled:opacity-60"
                            style={{
                              color: TEXT_MAIN,
                              backgroundColor: isActive ? DD_ITEM_ACT : "transparent",
                            }}
                            onMouseEnter={e => { if (!isActive) (e.currentTarget.style.backgroundColor = DD_ITEM_HV); }}
                            onMouseLeave={e => { if (!isActive) (e.currentTarget.style.backgroundColor = "transparent"); }}
                          >
                            {/* Status dot */}
                            <Circle
                              className="w-2 h-2 shrink-0 fill-current"
                              style={{ color: isOpen ? DOT_COLOR : "oklch(38% 0.04 252)" }}
                            />
                            <span className="flex-1 truncate font-medium">{label}</span>
                            {isActive && (
                              <span className="text-[9px] font-semibold tracking-wide uppercase" style={{ color: BTN_TABLE_TEXT }}>
                                activa
                              </span>
                            )}
                            {!isActive && isOpen && (
                              <span className="text-[9px]" style={{ color: TEXT_DIM }}>abierta</span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Close table */}
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
    </>
  );
}
