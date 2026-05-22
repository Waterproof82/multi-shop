"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { getWaiterMesa } from "@/components/waiter-login-form";

export function MesaOrderHistory() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [bouncing, setBouncing] = useState(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    // URL param takes priority (customer), fall back to sessionStorage (waiter navigation)
    const params = new URLSearchParams(window.location.search);
    const token = params.get("mesa");
    if (token) {
      setMesaId(token);
      return;
    }
    const stored = getWaiterMesa();
    if (stored) setMesaId(stored.mesaId);
  }, []);

  const fetchCount = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/mesas/${encodeURIComponent(id)}/orders`);
      if (!res.ok) return;
      const data = await res.json() as { orders: unknown[] };
      const count = data.orders?.length ?? 0;
      setOrderCount(count);
      if (count > prevCountRef.current && prevCountRef.current >= 0) {
        setBouncing(true);
        setTimeout(() => setBouncing(false), 700);
      }
      prevCountRef.current = count;
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    if (!mesaId) return;
    void fetchCount(mesaId);
    const interval = setInterval(() => { void fetchCount(mesaId); }, 10000);
    return () => clearInterval(interval);
  }, [mesaId, fetchCount]);

  useEffect(() => {
    if (!mesaId) return;
    const handler = () => { void fetchCount(mesaId); };
    window.addEventListener("tracking-token-added", handler);
    return () => window.removeEventListener("tracking-token-added", handler);
  }, [mesaId, fetchCount]);

  if (!mesaId) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
      <Link
        href={`/mesa/${mesaId}/orders`}
        className={[
          "inline-flex items-center gap-2.5 rounded-full px-5 py-3 text-sm font-bold shadow-xl min-h-[48px] transition-transform",
          "bg-foreground text-background hover:opacity-90",
          bouncing ? "animate-bounce" : "",
        ].join(" ")}
        aria-label={t("mesaViewOrders", lang)}
      >
        <ReceiptText className="w-4 h-4 shrink-0" />
        {t("mesaViewOrders", lang)}
        {orderCount > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-background/20 text-xs font-bold tabular-nums">
            {orderCount}
          </span>
        )}
      </Link>
    </div>
  );
}
