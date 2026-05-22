"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { UtensilsCrossed, ArrowLeftRight, LogOut } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { getWaiterMesa, clearWaiterMesa } from "@/components/waiter-login-form";

const BG = "oklch(17% 0.025 252)";
const BORDER = "oklch(42% 0.14 62 / 0.35)";
const TEXT_DIM = "oklch(52% 0.05 252)";
const TEXT_MAIN = "oklch(92% 0.02 252)";
const DOT_COLOR = "oklch(70% 0.19 148)";
const BTN_NEUTRAL_BG = "oklch(24% 0.03 252)";
const BTN_NEUTRAL_HOVER = "oklch(29% 0.04 252)";
const BTN_NEUTRAL_TEXT = "oklch(68% 0.06 252)";
const BTN_EXIT_BG = "oklch(21% 0.05 25)";
const BTN_EXIT_HOVER = "oklch(27% 0.07 25)";
const BTN_EXIT_TEXT = "oklch(65% 0.16 25)";

export function WaiterBanner() {
  const pathname = usePathname();
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [mesaLabel, setMesaLabel] = useState<string | null>(null);

  useEffect(() => {
    const stored = getWaiterMesa();
    if (!stored) { setMesaLabel(null); return; }

    fetch("/api/waiter/me")
      .then((r) => {
        if (r.ok) {
          setMesaLabel(stored.mesaNombre ?? `Mesa ${stored.mesaNumero}`);
        } else {
          clearWaiterMesa();
          setMesaLabel(null);
        }
      })
      .catch(() => null);
  }, [pathname]);

  if (!mesaLabel) return null;

  function handleChangeTable() { window.location.href = "/waiter"; }

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
          {/* Pulsing live indicator */}
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

          <UtensilsCrossed
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: TEXT_DIM }}
          />

          {/* Mode label — hidden on very small screens */}
          <span
            className="hidden xs:inline text-[10px] font-semibold tracking-[0.14em] uppercase shrink-0"
            style={{ color: TEXT_DIM }}
          >
            {t("waiterModeActive", lang)}
          </span>

          {/* Divider */}
          <span className="hidden xs:inline text-[10px]" style={{ color: TEXT_DIM }}>·</span>

          {/* Table name — always visible */}
          <span
            className="text-sm font-bold truncate"
            style={{ color: TEXT_MAIN }}
          >
            {mesaLabel}
          </span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleChangeTable}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 min-h-[32px]"
            style={{ color: BTN_NEUTRAL_TEXT, backgroundColor: BTN_NEUTRAL_BG }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = BTN_NEUTRAL_HOVER)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = BTN_NEUTRAL_BG)}
            aria-label={t("waiterChangeTable", lang)}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{t("waiterChangeTable", lang)}</span>
          </button>

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
