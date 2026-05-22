"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";

interface OrderItem {
  nombre: string;
  cantidad: number;
  complementos?: { nombre: string; precio: number }[];
  translations?: Record<string, { name?: string } | undefined>;
}

interface MesaOrder {
  id: string;
  items: OrderItem[];
  createdAt: string;
}

interface MesaSessionData {
  orders: MesaOrder[];
  sesionId: string | null;
  total: number;
}

interface MesaInfo {
  numero: number;
  nombre: string | null;
}

const PAGE_BG = "#f0ede8";

function PerforatedEdge({ position }: { position: "top" | "bottom" }) {
  const cy = position === "top" ? "0%" : "100%";
  return (
    <div
      aria-hidden
      style={{
        width: "100%",
        height: 10,
        background: `radial-gradient(circle at 50% ${cy}, ${PAGE_BG} 6px, #fffcf7 6px)`,
        backgroundSize: "16px 10px",
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}

function DottedRule() {
  return (
    <div
      aria-hidden
      style={{
        borderTop: "1px dashed #c9b99a",
        margin: "0",
      }}
    />
  );
}

export function MesaOrdersClient({ mesaId }: { mesaId: string }) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [sessionData, setSessionData] = useState<MesaSessionData | null>(null);
  const [mesaInfo, setMesaInfo] = useState<MesaInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (res.ok) setSessionData(await res.json() as MesaSessionData);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [mesaId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    fetch(`/api/mesas?token=${encodeURIComponent(mesaId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { numero: number; nombre: string | null } | null) => {
        if (d) setMesaInfo({ numero: d.numero, nombre: d.nombre });
      })
      .catch(() => null);
  }, [mesaId]);

  const allItems = sessionData?.orders.flatMap((o) => o.items) ?? [];

  const firstOrderDate = sessionData?.orders[0]?.createdAt
    ? new Date(sessionData.orders[0].createdAt)
    : null;
  const dateStr = firstOrderDate?.toLocaleDateString(language, { day: "2-digit", month: "2-digit", year: "numeric" }) ?? "";
  const timeStr = firstOrderDate?.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "";
  const tableLabel = mesaInfo?.nombre ?? (mesaInfo ? `Mesa ${mesaInfo.numero}` : "Mesa");

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-xs">

        {/* Back link */}
        <div className="mb-5">
          <Link
            href={`/?mesa=${mesaId}`}
            className="text-sm font-medium transition-colors"
            style={{ color: "#8a7560" }}
          >
            {t("mesaBackToMenu", lang)}
          </Link>
        </div>

        {/* Loading / empty */}
        {loading && allItems.length === 0 && (
          <p className="text-center py-12" style={{ color: "#8a7560" }}>{t("loading", lang)}</p>
        )}
        {!loading && allItems.length === 0 && (
          <p className="text-center py-12" style={{ color: "#8a7560" }}>{t("mesaNoOrders", lang)}</p>
        )}

        {/* Ticket */}
        {allItems.length > 0 && sessionData && (
          <div
            className="w-full drop-shadow-xl"
            style={{ filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.18))" }}
          >
            {/* Top perforation */}
            <PerforatedEdge position="top" />

            {/* Ticket body */}
            <div
              className="flex flex-col gap-0"
              style={{ backgroundColor: "#fffcf7", padding: "0 20px" }}
            >
              {/* Header */}
              <div className="flex flex-col items-center py-5 gap-1">
                <p
                  className="text-xs tracking-[0.25em] uppercase"
                  style={{ color: "#8a7560", fontFamily: "monospace" }}
                >
                  {tableLabel}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "#b0a090", fontFamily: "monospace" }}
                >
                  {dateStr} · {timeStr}
                </p>
              </div>

              <DottedRule />

              {/* Column headers */}
              <div
                className="flex justify-between pt-3 pb-1 text-xs uppercase tracking-widest"
                style={{ color: "#b0a090", fontFamily: "monospace" }}
              >
                <span>{t("mesaTicketQty", lang)}&nbsp;&nbsp;{t("mesaTicketItem", lang)}</span>
              </div>

              {/* Items */}
              <ul className="flex flex-col gap-1 pb-4">
                {allItems.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-baseline gap-3 text-sm"
                    style={{ color: "#1a1612", fontFamily: "monospace" }}
                  >
                    <span
                      className="tabular-nums w-4 text-right shrink-0"
                      style={{ color: "#8a7560" }}
                    >
                      {item.cantidad}
                    </span>
                    <span className="flex flex-col">
                      <span>{(language !== "es" && item.translations?.[language]?.name) || item.nombre}</span>
                      {item.complementos && item.complementos.length > 0 && (
                        <span className="text-xs" style={{ color: "#b0a090" }}>
                          + {item.complementos.map(c => c.nombre).join(", ")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <DottedRule />

              {/* Total */}
              <div
                className="flex justify-between items-baseline py-4"
                style={{ fontFamily: "monospace" }}
              >
                <span
                  className="text-xs uppercase tracking-[0.2em]"
                  style={{ color: "#8a7560" }}
                >
                  {t("mesaRunningTotal", lang)}
                </span>
                <span
                  className="text-lg font-bold tabular-nums"
                  style={{ color: "#1a1612" }}
                >
                  {formatPrice(sessionData.total, "EUR", lang)}
                </span>
              </div>

              <DottedRule />

              {/* Footer */}
              <p
                className="text-center py-4 text-xs tracking-widest uppercase"
                style={{ color: "#c9b99a", fontFamily: "monospace" }}
              >
                {t("mesaTicketThanks", lang)}
              </p>
            </div>

            {/* Bottom perforation */}
            <PerforatedEdge position="bottom" />
          </div>
        )}
      </div>
    </div>
  );
}
