"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

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

export function WaiterLoginForm() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const router = useRouter();

  const [isReturning, setIsReturning] = useState(false);
  const [pin, setPin] = useState("");
  const [mesaNumero, setMesaNumero] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/waiter/me")
      .then((r) => { if (r.ok) setIsReturning(true); })
      .catch(() => null);
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const endpoint = isReturning ? "/api/waiter/mesa" : "/api/waiter/auth";
      const body = isReturning
        ? { mesaNumero: Number(mesaNumero) }
        : { pin, mesaNumero: Number(mesaNumero) };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as { mesaId: string; mesaNumero: number; mesaNombre: string | null };
        saveWaiterMesa({ mesaId: data.mesaId, mesaNumero: data.mesaNumero, mesaNombre: data.mesaNombre });
        router.push(`/?mesa=${data.mesaId}`);
      } else {
        if (res.status === 401 && isReturning) {
          clearWaiterMesa();
          setIsReturning(false);
        }
        setError(t("waiterLoginError", lang));
      }
    } catch {
      setError(t("waiterLoginError", lang));
    } finally {
      setLoading(false);
    }
  }

  const title = isReturning ? t("waiterSelectMesaTitle", lang) : t("waiterTablesTitle", lang);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-lg p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground text-center">
        {title}
      </h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mesaNumero" className="text-sm font-medium text-foreground">
            {t("waiterMesaNumeroLabel", lang)}
          </label>
          <input
            id="mesaNumero"
            type="number"
            inputMode="numeric"
            min={1}
            value={mesaNumero}
            onChange={(e) => setMesaNumero(e.target.value)}
            placeholder={t("waiterMesaNumeroPlaceholder", lang)}
            className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] placeholder:text-muted-foreground"
            required
          />
        </div>

        {!isReturning && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin" className="text-sm font-medium text-foreground">
              {t("waiterPinLabel", lang)}
            </label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              maxLength={12}
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={t("waiterPinPlaceholder", lang)}
              className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] placeholder:text-muted-foreground"
              required
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive text-center" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || mesaNumero === "" || (!isReturning && pin.length === 0)}
          className="min-h-[44px] w-full rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold text-base transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t("loading", lang) : t("waiterLoginButton", lang)}
        </button>
      </form>
    </div>
  );
}
