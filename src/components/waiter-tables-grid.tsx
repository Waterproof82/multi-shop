"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed } from "lucide-react";
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
  const router = useRouter();
  const [mesas, setMesas] = useState<MesaWithSession[]>(initialMesas);

  const refresh = useCallback(async () => {
    const updated = await fetchMesas();
    if (updated.length > 0) setMesas(updated);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => { void refresh(); }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (mesas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <UtensilsCrossed className="w-12 h-12 opacity-20" style={{ color: "oklch(60% 0.05 252)" }} />
        <p style={{ color: "oklch(52% 0.05 252)" }} className="text-sm">
          No hay mesas configuradas
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
      {mesas.map((mesa) => (
        <TableCard
          key={mesa.id}
          mesa={mesa}
          isOpen={!!mesa.sesionId}
          isPaid={mesa.sesionPagada}
          onClick={() => router.push(`/waiter/tables/${mesa.id}`)}
        />
      ))}
    </div>
  );
}

interface TableCardProps {
  mesa: MesaWithSession;
  isOpen: boolean;
  isPaid: boolean;
  onClick: () => void;
}

function TableCard({ mesa, isOpen, isPaid, onClick }: TableCardProps) {
  const statusLabel = isPaid ? "pagada" : isOpen ? "ocupada" : "libre";

  const cardBg = isPaid
    ? "oklch(20% 0.06 62 / 0.7)"
    : isOpen
      ? "oklch(20% 0.06 148 / 0.7)"
      : "oklch(20% 0.025 252 / 0.7)";

  const cardBorder = isPaid
    ? "1px solid oklch(55% 0.18 62 / 0.5)"
    : isOpen
      ? "1px solid oklch(55% 0.18 148 / 0.5)"
      : "1px solid oklch(35% 0.04 252 / 0.6)";

  const cardShadow = isPaid
    ? "0 0 18px oklch(55% 0.18 62 / 0.15), inset 0 1px 0 oklch(70% 0.15 62 / 0.1)"
    : isOpen
      ? "0 0 18px oklch(55% 0.18 148 / 0.15), inset 0 1px 0 oklch(70% 0.15 148 / 0.1)"
      : "inset 0 1px 0 oklch(100% 0 0 / 0.04)";

  const iconColor = isPaid
    ? "oklch(65% 0.16 62)"
    : isOpen
      ? "oklch(65% 0.16 148)"
      : "oklch(42% 0.06 252)";

  const numberColor = isPaid
    ? "oklch(92% 0.04 62)"
    : isOpen
      ? "oklch(92% 0.04 148)"
      : "oklch(80% 0.03 252)";

  const nameColor = isPaid
    ? "oklch(60% 0.10 62)"
    : isOpen
      ? "oklch(60% 0.10 148)"
      : "oklch(48% 0.05 252)";

  return (
    <button
      onClick={onClick}
      aria-label={`Mesa ${mesa.numero}${mesa.nombre ? ` — ${mesa.nombre}` : ""} (${statusLabel})`}
      className="group relative flex flex-col items-center justify-between rounded-2xl p-4 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-none"
      style={{ minHeight: "130px", background: cardBg, border: cardBorder, boxShadow: cardShadow }}
    >
      {/* Status dot */}
      <div className="absolute top-3 right-3">
        {isPaid ? (
          <span
            className="block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "oklch(70% 0.19 62)" }}
          />
        ) : isOpen ? (
          <span className="relative flex h-2.5 w-2.5">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ backgroundColor: "oklch(70% 0.19 148)" }}
            />
            <span
              className="relative inline-flex h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "oklch(70% 0.19 148)" }}
            />
          </span>
        ) : (
          <span
            className="block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: "oklch(38% 0.04 252)" }}
          />
        )}
      </div>

      {/* Icon + number */}
      <div className="flex flex-col items-center gap-1 flex-1 justify-center">
        <UtensilsCrossed className="w-5 h-5 mb-1" style={{ color: iconColor }} />
        <span
          className="text-3xl font-black leading-none tracking-tight"
          style={{ color: numberColor }}
        >
          {mesa.numero}
        </span>
        {mesa.nombre && (
          <span
            className="text-[10px] font-medium truncate max-w-full mt-0.5"
            style={{ color: nameColor }}
          >
            {mesa.nombre}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="w-full mt-2 min-h-[28px] flex flex-col items-center gap-0.5">
        {isPaid ? (
          <>
            <span
              className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full"
              style={{ background: "oklch(30% 0.10 62 / 0.6)", color: "oklch(82% 0.18 62)" }}
            >
              Pagada
            </span>
            <span className="text-[10px] font-medium" style={{ color: "oklch(58% 0.10 62)" }}>
              {formatPrice(mesa.sessionTotal)}
            </span>
          </>
        ) : isOpen ? (
          <>
            <span
              className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full"
              style={{ background: "oklch(30% 0.10 148 / 0.6)", color: "oklch(82% 0.18 148)" }}
            >
              Ocupada
            </span>
            <span className="text-[10px] font-medium" style={{ color: "oklch(58% 0.10 148)" }}>
              {mesa.activeOrderCount} pedido{mesa.activeOrderCount !== 1 ? "s" : ""}
              {mesa.sessionTotal > 0 && ` · ${formatPrice(mesa.sessionTotal)}`}
            </span>
          </>
        ) : (
          <span
            className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full"
            style={{ background: "oklch(24% 0.03 252 / 0.7)", color: "oklch(62% 0.05 252)" }}
          >
            Libre
          </span>
        )}
      </div>
    </button>
  );
}
