"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import type { MesaWithSession } from "@/core/domain/repositories/IMesaRepository";

interface WaiterTablesGridProps {
  mesas: MesaWithSession[];
}

async function fetchMesas(): Promise<MesaWithSession[]> {
  try {
    const res = await fetch("/api/waiter/mesas");
    if (!res.ok) return [];
    const data = await res.json() as { mesas: MesaWithSession[] };
    return data.mesas ?? [];
  } catch {
    return [];
  }
}

export function WaiterTablesGrid({ mesas: initialMesas }: WaiterTablesGridProps) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaWithSession[]>(initialMesas);

  const refresh = useCallback(async () => {
    const updated = await fetchMesas();
    if (updated.length > 0) {
      setMesas(updated);
    }
  }, []);

  // Poll every 15s
  useEffect(() => {
    const interval = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {t("waiterTablesTitle", lang)}
      </h1>

      {mesas.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          {t("waiterNoOrders", lang)}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {mesas.map((mesa) => {
            const isOpen = !!mesa.sesionId;
            return (
              <button
                key={mesa.id}
                onClick={() => router.push(`/waiter/tables/${mesa.id}`)}
                aria-label={`Mesa ${mesa.numero}${mesa.nombre ? ` — ${mesa.nombre}` : ''}`}
                className={[
                  "min-h-[44px] rounded-xl border p-4 flex flex-col gap-2 text-left transition-colors hover:opacity-80",
                  isOpen
                    ? "border-green-500 bg-green-50 dark:bg-green-950"
                    : "border-border bg-card",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg font-bold text-foreground">
                    {mesa.numero}
                  </span>
                  <span
                    className={[
                      "text-xs font-medium px-1.5 py-0.5 rounded-full",
                      isOpen
                        ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {isOpen ? t("waiterTableOpen", lang) : t("waiterTableClosed", lang)}
                  </span>
                </div>

                {mesa.nombre && (
                  <p className="text-xs text-muted-foreground truncate">{mesa.nombre}</p>
                )}

                {isOpen && (
                  <div className="mt-auto flex flex-col gap-0.5">
                    <p className="text-xs text-muted-foreground">
                      {mesa.activeOrderCount} pedido{mesa.activeOrderCount !== 1 ? "s" : ""}
                    </p>
                    {mesa.sessionTotal > 0 && (
                      <p className="text-sm font-semibold text-foreground">
                        {formatPrice(mesa.sessionTotal, "EUR", lang)}
                      </p>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
