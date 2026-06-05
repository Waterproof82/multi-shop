"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { UtensilsCrossed, KeyRound, Clock } from "lucide-react";
import { formatPrice } from "@/lib/format-price";
import type { MesaWithSession } from "@/core/domain/repositories/IMesaRepository";

export const WAITER_MESA_KEY = "waiter_mesa";

export interface WaiterMesaSession {
  mesaId: string;
  mesaNumero: number;
  mesaNombre: string | null;
}

export function saveWaiterMesa(data: WaiterMesaSession) {
  sessionStorage.setItem(WAITER_MESA_KEY, JSON.stringify(data));
}

export function clearWaiterMesa() {
  sessionStorage.removeItem(WAITER_MESA_KEY);
}

export function getWaiterMesa(): WaiterMesaSession | null {
  try {
    const raw = sessionStorage.getItem(WAITER_MESA_KEY);
    return raw ? (JSON.parse(raw) as WaiterMesaSession) : null;
  } catch {
    return null;
  }
}

type Step = "pin" | "tables";

async function fetchMesas(): Promise<MesaWithSession[]> {
  try {
    const res = await fetch("/api/waiter/mesas", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json() as { mesas: MesaWithSession[] };
    return data.mesas ?? [];
  } catch {
    return [];
  }
}

interface MesaColors {
  bg: string;
  border: string;
  shadow: string;
  icon: string;
  num: string;
  name: string;
  dot: string;
}

function getMesaColors(isPaid: boolean, isPaymentInProgress: boolean, isOpen: boolean): MesaColors {
  if (isPaid) {
    return {
      bg: "oklch(20% 0.06 290 / 0.7)",
      border: "1px solid oklch(55% 0.18 290 / 0.5)",
      shadow: "0 0 18px oklch(55% 0.18 290 / 0.15), inset 0 1px 0 oklch(70% 0.15 290 / 0.1)",
      icon: "oklch(65% 0.16 290)",
      num: "oklch(92% 0.04 290)",
      name: "oklch(60% 0.10 290)",
      dot: "oklch(70% 0.19 290)",
    };
  }
  if (isPaymentInProgress) {
    return {
      bg: "oklch(20% 0.06 62 / 0.7)",
      border: "1px solid oklch(55% 0.18 62 / 0.5)",
      shadow: "0 0 18px oklch(55% 0.18 62 / 0.15), inset 0 1px 0 oklch(70% 0.15 62 / 0.1)",
      icon: "oklch(65% 0.16 62)",
      num: "oklch(92% 0.04 62)",
      name: "oklch(60% 0.10 62)",
      dot: "oklch(70% 0.19 62)",
    };
  }
  if (isOpen) {
    return {
      bg: "oklch(20% 0.06 148 / 0.7)",
      border: "1px solid oklch(55% 0.18 148 / 0.5)",
      shadow: "0 0 18px oklch(55% 0.18 148 / 0.15), inset 0 1px 0 oklch(70% 0.15 148 / 0.1)",
      icon: "oklch(65% 0.16 148)",
      num: "oklch(92% 0.04 148)",
      name: "oklch(60% 0.10 148)",
      dot: "oklch(70% 0.19 148)",
    };
  }
  return {
    bg: "oklch(20% 0.025 252 / 0.7)",
    border: "1px solid oklch(35% 0.04 252 / 0.6)",
    shadow: "inset 0 1px 0 oklch(100% 0 0 / 0.04)",
    icon: "oklch(42% 0.06 252)",
    num: "oklch(80% 0.03 252)",
    name: "oklch(48% 0.05 252)",
    dot: "oklch(38% 0.04 252)",
  };
}

function getMesaStatus(isPaid: boolean, isPaymentInProgress: boolean, isOpen: boolean): string {
  if (isPaid) return "pagada";
  if (isPaymentInProgress) return "pago en curso";
  if (isOpen) return "ocupada";
  return "libre";
}

function MesaDot({ pulsing, dotColor }: Readonly<{ pulsing: boolean; dotColor: string }>) {
  if (pulsing) {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: dotColor }} />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
      </span>
    );
  }
  return <span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />;
}

interface MesaFooterProps {
  readonly isPaid: boolean;
  readonly isPaymentInProgress: boolean;
  readonly isOpen: boolean;
  readonly sessionTotal: number;
  readonly activeOrderCount: number;
}

function MesaFooter({ isPaid, isPaymentInProgress, isOpen, sessionTotal, activeOrderCount }: MesaFooterProps) {
  if (isPaid) {
    return (
      <>
        <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(28% 0.10 290 / 0.6)", color: "oklch(82% 0.18 290)" }}>
          Pagada
        </span>
        <span className="text-[10px] font-medium" style={{ color: "oklch(58% 0.10 290)" }}>
          {formatPrice(sessionTotal)}
        </span>
      </>
    );
  }
  if (isPaymentInProgress) {
    return (
      <>
        <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(30% 0.10 62 / 0.6)", color: "oklch(82% 0.18 62)" }}>
          En pago
        </span>
        <span className="text-[10px] font-medium" style={{ color: "oklch(58% 0.10 62)" }}>
          {formatPrice(sessionTotal)}
        </span>
      </>
    );
  }
  if (isOpen) {
    const orderSuffix = activeOrderCount === 1 ? "" : "s";
    const totalLabel = sessionTotal > 0 ? ` · ${formatPrice(sessionTotal)}` : "";
    return (
      <>
        <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(30% 0.10 148 / 0.6)", color: "oklch(82% 0.18 148)" }}>
          Ocupada
        </span>
        <span className="text-[10px] font-medium" style={{ color: "oklch(58% 0.10 148)" }}>
          {activeOrderCount} pedido{orderSuffix}{totalLabel}
        </span>
      </>
    );
  }
  return (
    <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(24% 0.03 252 / 0.7)", color: "oklch(62% 0.05 252)" }}>
      Libre
    </span>
  );
}

interface MesaCardProps {
  readonly mesa: MesaWithSession;
  readonly isLoading: boolean;
  readonly onClick: () => void;
}

function MesaCard({ mesa, isLoading, onClick }: MesaCardProps) {
  const isOpen = !!mesa.sesionId && mesa.activeOrderCount > 0;
  const isPaid = mesa.sesionPagada;
  const isPaymentInProgress = mesa.pagoEnCurso && !mesa.sesionPagada;
  const colors = getMesaColors(isPaid, isPaymentInProgress, isOpen);
  const statusLabel = getMesaStatus(isPaid, isPaymentInProgress, isOpen);
  const nameSuffix = mesa.nombre ? ` — ${mesa.nombre}` : "";
  const pulsing = !isPaid && (isPaymentInProgress || isOpen);

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      aria-label={`Mesa ${mesa.numero}${nameSuffix} (${statusLabel})`}
      className="group relative flex flex-col items-center justify-between rounded-2xl p-4 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed w-full"
      style={{ minHeight: "128px", background: colors.bg, border: colors.border, boxShadow: colors.shadow }}
    >
      <div className="absolute top-3 right-3">
        <MesaDot pulsing={pulsing} dotColor={colors.dot} />
      </div>

      <div className="flex flex-col items-center gap-1 flex-1 justify-center">
        <UtensilsCrossed className="w-5 h-5 mb-1" style={{ color: colors.icon }} />
        <span className="text-3xl font-black leading-none tracking-tight" style={{ color: colors.num }}>
          {isLoading ? "…" : mesa.numero}
        </span>
        {mesa.nombre && (
          <span className="text-[10px] font-medium truncate max-w-full mt-0.5" style={{ color: colors.name }}>
            {mesa.nombre}
          </span>
        )}
      </div>

      <div className="w-full mt-2 min-h-[24px] flex flex-col items-center gap-0.5">
        <MesaFooter
          isPaid={isPaid}
          isPaymentInProgress={isPaymentInProgress}
          isOpen={isOpen}
          sessionTotal={mesa.sessionTotal}
          activeOrderCount={mesa.activeOrderCount}
        />
        {mesa.itemsDiferidos.length > 0 && (
          <div
            className="w-full mt-1.5 rounded-lg px-2 py-1.5 flex flex-col gap-0.5"
            style={{ background: 'oklch(18% 0.05 62 / 0.7)', border: '1px solid oklch(38% 0.1 62 / 0.5)' }}
          >
            <div className="flex items-center gap-1 mb-0.5">
              <Clock className="w-3 h-3 shrink-0" style={{ color: 'oklch(72% 0.16 62)' }} />
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(72% 0.16 62)' }}>
                Para servir
              </span>
            </div>
            {mesa.itemsDiferidos.map((d, i) => (
              <div key={i} className="flex items-baseline justify-between gap-1.5">
                <span className="text-[11px] leading-snug break-words min-w-0" style={{ color: 'oklch(84% 0.05 62)', wordBreak: 'break-word' }}>
                  {d.itemName}
                </span>
                <span className="text-[11px] font-bold shrink-0" style={{ color: 'oklch(72% 0.16 62)' }}>
                  ×{d.quantity}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

export function WaiterLoginForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [mesas, setMesas] = useState<MesaWithSession[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mesaLoading, setMesaLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await fetchMesas();
    if (data.length > 0) setMesas(data);
  }, []);

  useEffect(() => {
    if (step !== "tables" || !empresaId) return;

    void refresh();
    const interval = setInterval(() => { void refresh(); }, 2000);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`waiter-grid:${empresaId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'mesa_sesiones',
        filter: `empresa_id=eq.${empresaId}`,
      }, () => { void refresh(); })
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [step, empresaId, refresh]);

  useEffect(() => {
    fetch("/api/waiter/me")
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json() as { empresaId?: string };
          if (data.empresaId) setEmpresaId(data.empresaId);
          setStep("tables");
        }
      })
      .catch(() => null);
  }, []);

  async function handlePinSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waiter/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        const data = await res.json() as { empresaId?: string };
        if (data.empresaId) setEmpresaId(data.empresaId);
        setStep("tables");
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "PIN incorrecto");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  async function handleMesaClick(mesa: MesaWithSession) {
    setMesaLoading(mesa.id);
    setError(null);

    try {
      const res = await fetch("/api/waiter/mesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaNumero: mesa.numero }),
      });

      if (res.ok) {
        const data = await res.json() as { mesaId: string; mesaNumero: number; mesaNombre: string | null };
        saveWaiterMesa({ mesaId: data.mesaId, mesaNumero: data.mesaNumero, mesaNombre: data.mesaNombre });
        router.push(`/?mesa=${data.mesaId}`);
      } else {
        setError("No se pudo acceder a la mesa");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setMesaLoading(null);
    }
  }

  if (step === "pin") {
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex items-center justify-center w-16 h-16 rounded-2xl"
            style={{ background: "oklch(20% 0.04 252 / 0.8)", border: "1px solid oklch(32% 0.05 252 / 0.6)" }}
          >
            <KeyRound className="w-7 h-7" style={{ color: "oklch(60% 0.08 252)" }} />
          </div>
          <p className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: "oklch(42% 0.06 252)" }}>
            Acceso Camarero
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void handlePinSubmit(); }}
          className="w-full max-w-xs flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <label
              htmlFor="pin"
              className="text-xs font-semibold tracking-widest uppercase"
              style={{ color: "oklch(42% 0.06 252)" }}
            >
              PIN
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={12}
              autoComplete="off"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl px-4 py-4 text-center text-2xl font-bold tracking-[0.4em] focus:outline-none focus:ring-2 transition-all"
              style={{
                background: "oklch(17% 0.025 252 / 0.9)",
                border: "1px solid oklch(32% 0.05 252 / 0.7)",
                color: "oklch(88% 0.03 252)",
                caretColor: "oklch(60% 0.08 252)",
              }}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: "oklch(65% 0.2 25)" }} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || pin.length < 4}
            className="w-full rounded-xl py-4 font-bold text-base transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: loading || pin.length < 4
                ? "oklch(25% 0.04 252 / 0.6)"
                : "oklch(28% 0.06 252 / 0.9)",
              border: "1px solid oklch(40% 0.06 252 / 0.5)",
              color: "oklch(80% 0.04 252)",
            }}
          >
            {loading ? "Verificando..." : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      <p className="text-xs font-semibold tracking-[0.18em] uppercase" style={{ color: "oklch(42% 0.06 252)" }}>
        Seleccioná una mesa
      </p>

      {error && (
        <p className="text-sm text-center" style={{ color: "oklch(65% 0.2 25)" }} role="alert">
          {error}
        </p>
      )}

      {mesas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12">
          <UtensilsCrossed className="w-10 h-10 opacity-20" style={{ color: "oklch(60% 0.05 252)" }} />
          <p className="text-sm" style={{ color: "oklch(50% 0.05 252)" }}>
            No hay mesas configuradas
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {mesas.map((mesa) => (
            <MesaCard
              key={mesa.id}
              mesa={mesa}
              isLoading={mesaLoading === mesa.id}
              onClick={() => void handleMesaClick(mesa)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
