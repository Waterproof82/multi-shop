"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, KeyRound } from "lucide-react";
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
    const res = await fetch("/api/waiter/mesas");
    if (!res.ok) return [];
    const data = await res.json() as { mesas: MesaWithSession[] };
    return data.mesas ?? [];
  } catch {
    return [];
  }
}

export function WaiterLoginForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("pin");
  const [pin, setPin] = useState("");
  const [mesas, setMesas] = useState<MesaWithSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [mesaLoading, setMesaLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMesas = useCallback(async () => {
    const data = await fetchMesas();
    setMesas(data);
  }, []);

  useEffect(() => {
    // If they already have a valid session cookie, skip PIN and go to tables
    fetch("/api/waiter/me")
      .then(async (r) => {
        if (r.ok) {
          await loadMesas();
          setStep("tables");
        }
      })
      .catch(() => null);
  }, [loadMesas]);

  async function handlePinSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/waiter/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        await loadMesas();
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
          onSubmit={handlePinSubmit}
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

  // Step: tables
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
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {mesas.map((mesa) => {
            const isOpen = !!mesa.sesionId;
            const isLoading = mesaLoading === mesa.id;
            return (
              <button
                key={mesa.id}
                onClick={() => void handleMesaClick(mesa)}
                disabled={isLoading}
                aria-label={`Mesa ${mesa.numero}${mesa.nombre ? ` — ${mesa.nombre}` : ""}${isOpen ? " (ocupada)" : " (libre)"}`}
                className="group relative flex flex-col items-center justify-between rounded-2xl p-4 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] focus-visible:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  minHeight: "120px",
                  background: isOpen
                    ? "oklch(20% 0.06 148 / 0.7)"
                    : "oklch(20% 0.025 252 / 0.7)",
                  border: isOpen
                    ? "1px solid oklch(55% 0.18 148 / 0.5)"
                    : "1px solid oklch(35% 0.04 252 / 0.6)",
                  boxShadow: isOpen
                    ? "0 0 18px oklch(55% 0.18 148 / 0.15), inset 0 1px 0 oklch(70% 0.15 148 / 0.1)"
                    : "inset 0 1px 0 oklch(100% 0 0 / 0.04)",
                }}
              >
                {/* Status dot */}
                <div className="absolute top-3 right-3">
                  {isOpen ? (
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
                  <UtensilsCrossed
                    className="w-5 h-5 mb-1"
                    style={{ color: isOpen ? "oklch(65% 0.16 148)" : "oklch(42% 0.06 252)" }}
                  />
                  <span
                    className="text-3xl font-black leading-none tracking-tight"
                    style={{ color: isOpen ? "oklch(92% 0.04 148)" : "oklch(80% 0.03 252)" }}
                  >
                    {isLoading ? "…" : mesa.numero}
                  </span>
                  {mesa.nombre && (
                    <span
                      className="text-[10px] font-medium truncate max-w-full mt-0.5"
                      style={{ color: isOpen ? "oklch(60% 0.10 148)" : "oklch(48% 0.05 252)" }}
                    >
                      {mesa.nombre}
                    </span>
                  )}
                </div>

                {/* Footer */}
                <div className="w-full mt-2 min-h-[24px] flex flex-col items-center gap-0.5">
                  {isOpen ? (
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
          })}
        </div>
      )}
    </div>
  );
}
