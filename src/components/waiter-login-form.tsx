"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseAnonClient } from '@/core/infrastructure/database/supabase-client';
import { UtensilsCrossed, KeyRound, Pause, ReceiptText, X, CheckSquare, ExternalLink, PlayCircle, BellRing } from "lucide-react";
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

function getMesaColors(isPaid: boolean, isPaymentInProgress: boolean, isOpen: boolean, isActive: boolean): MesaColors {
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
    // Con pedidos — amarillo
    return {
      bg: "oklch(20% 0.06 95 / 0.7)",
      border: "1px solid oklch(55% 0.18 95 / 0.5)",
      shadow: "0 0 18px oklch(55% 0.18 95 / 0.15), inset 0 1px 0 oklch(70% 0.15 95 / 0.1)",
      icon: "oklch(65% 0.16 95)",
      num: "oklch(92% 0.04 95)",
      name: "oklch(60% 0.10 95)",
      dot: "oklch(70% 0.19 95)",
    };
  }
  if (isActive) {
    // Activa — verde
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

function getMesaStatus(isPaid: boolean, isPaymentInProgress: boolean, isOpen: boolean, isActive: boolean): string {
  if (isPaid) return "pagada";
  if (isPaymentInProgress) return "pagando";
  if (isOpen) return "con pedidos";
  if (isActive) return "activa";
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
  readonly isActive: boolean;
  readonly sessionTotal: number;
  readonly activeOrderCount: number;
}

function MesaFooter({ isPaid, isPaymentInProgress, isOpen, isActive, sessionTotal, activeOrderCount }: MesaFooterProps) {
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
          Pagando
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
        <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(30% 0.10 95 / 0.6)", color: "oklch(82% 0.18 95)" }}>
          Con pedidos
        </span>
        <span className="text-[10px] font-medium" style={{ color: "oklch(58% 0.10 95)" }}>
          {activeOrderCount} pedido{orderSuffix}{totalLabel}
        </span>
      </>
    );
  }
  if (isActive) {
    return (
      <span className="text-[11px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full" style={{ background: "oklch(28% 0.10 148 / 0.6)", color: "oklch(82% 0.18 148)" }}>
        Activa
      </span>
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
  readonly onClickDeferred: () => void;
  readonly onClickListos: () => void;
  readonly onViewTicket: () => void;
  readonly onCloseMesa?: () => void;
  readonly onDismissCall?: () => void;
}

function MesaCard({ mesa, isLoading, onClick, onClickDeferred, onClickListos, onViewTicket, onCloseMesa, onDismissCall }: MesaCardProps) {
  const isPaid = mesa.sesionPagada;
  const isPaymentInProgress = (mesa.pagoEnCurso || mesa.divisionActiva) && !mesa.sesionPagada;
  const isOpen = !!mesa.sesionId && mesa.activeOrderCount > 0 && !isPaid && !isPaymentInProgress;
  const isActive = !!mesa.sesionId && mesa.clienteActivo && mesa.activeOrderCount === 0 && !isPaid && !isPaymentInProgress;
  const colors = getMesaColors(isPaid, isPaymentInProgress, isOpen, isActive);
  const statusLabel = getMesaStatus(isPaid, isPaymentInProgress, isOpen, isActive);
  const nameSuffix = mesa.nombre ? ` — ${mesa.nombre}` : "";
  const pulsing = !isPaid && (isPaymentInProgress || isOpen || isActive);
  const hasSession = mesa.activeOrderCount > 0;

  return (
    <div className="relative flex flex-col gap-1.5 w-full">
      {/* Main card button */}
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

        {/* Call-waiter indicator — top-left, dismiss on click */}
        {mesa.llamadaActiva && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onDismissCall?.(); }}
            className="absolute top-2 left-2 flex items-center justify-center rounded-full w-7 h-7 animate-pulse"
            style={{ background: 'oklch(25% 0.18 55)', border: '1px solid oklch(60% 0.28 55 / 0.7)' }}
            aria-label="Llamada de cliente — pulsar para descartar"
          >
            <BellRing className="w-3.5 h-3.5" style={{ color: 'oklch(85% 0.22 55)' }} />
          </button>
        )}

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
            isActive={isActive}
            sessionTotal={mesa.sessionTotal}
            activeOrderCount={mesa.activeOrderCount}
          />
        </div>
      </button>

      {/* Preparado badge — shown when any pedido in session has been marked ready by kitchen */}
      {mesa.preparadoPedidoNumbers.length > 0 && (
        <button
          onClick={onClickListos}
          className="w-full rounded-lg px-2 py-1.5 flex items-center gap-1.5 active:brightness-125 transition-all text-left"
          style={{ background: 'oklch(18% 0.08 148 / 0.7)', border: '1px solid oklch(45% 0.15 148 / 0.5)' }}
        >
          <CheckSquare className="w-3 h-3 shrink-0" style={{ color: 'oklch(72% 0.20 148)' }} />
          <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(72% 0.20 148)' }}>
            Platos listos
          </span>
        </button>
      )}

      {/* Deferred items */}
      {mesa.itemsDiferidos.length > 0 && (
        <button
          onClick={onClickDeferred}
          className="w-full rounded-lg px-2 py-1.5 flex flex-col gap-0.5 cursor-pointer hover:brightness-125 transition-all text-left"
          style={{ background: 'oklch(18% 0.05 62 / 0.7)', border: '1px solid oklch(38% 0.1 62 / 0.5)' }}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <Pause className="w-3 h-3 shrink-0" style={{ color: 'oklch(72% 0.16 62)' }} />
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(72% 0.16 62)' }}>
              Retenidos
            </span>
          </div>
          {mesa.itemsDiferidos.map((d) => (
            <div key={d.itemName} className="flex items-baseline justify-between gap-1.5">
              <span className="text-[11px] leading-snug break-words min-w-0" style={{ color: 'oklch(84% 0.05 62)', wordBreak: 'break-word' }}>
                {d.itemName}
              </span>
              <span className="text-[11px] font-bold shrink-0" style={{ color: 'oklch(72% 0.16 62)' }}>
                ×{d.quantity}
              </span>
            </div>
          ))}
        </button>
      )}

      {/* Ver ticket */}
      {hasSession && (
        <button
          onClick={onViewTicket}
          className="w-full rounded-lg px-2 py-1.5 flex items-center justify-center gap-1.5 hover:brightness-125 transition-all"
          style={{ background: 'oklch(18% 0.04 252 / 0.7)', border: '1px solid oklch(35% 0.06 252 / 0.5)' }}
        >
          <ReceiptText className="w-3 h-3 shrink-0" style={{ color: 'oklch(62% 0.08 252)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(62% 0.08 252)' }}>
            Ver ticket
          </span>
        </button>
      )}

      {/* Cerrar mesa — visible si hay pedidos O si un cliente real entró al menú */}
      {!!mesa.sesionId && (mesa.activeOrderCount > 0 || mesa.clienteActivo) && !isPaymentInProgress && onCloseMesa && (
        <button
          onClick={onCloseMesa}
          className="w-full rounded-lg px-2 py-1.5 flex items-center justify-center gap-1.5 hover:brightness-125 transition-all"
          style={{ background: 'oklch(18% 0.06 290 / 0.7)', border: '1px solid oklch(42% 0.14 290 / 0.5)' }}
        >
          <X className="w-3 h-3 shrink-0" style={{ color: 'oklch(68% 0.16 290)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'oklch(68% 0.16 290)' }}>
            Cerrar mesa
          </span>
        </button>
      )}
    </div>
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
  const [closeBlockedError, setCloseBlockedError] = useState<string | null>(null);
  const [deferredMesa, setDeferredMesa] = useState<MesaWithSession | null>(null);
  const [launching, setLaunching] = useState(false);
  const llamadasRef = useRef<Set<string>>(new Set());
  const channelNameRef = useRef(`waiter-login-mesas-${Math.random().toString(36).slice(2)}`);

  const refresh = useCallback(async () => {
    const data = await fetchMesas();
    if (data.length > 0) {
      const newLlamadas = new Set(data.filter(m => m.llamadaActiva).map(m => m.id));
      for (const id of newLlamadas) {
        if (!llamadasRef.current.has(id)) {
          try { const a = new Audio('/bell.mp3'); a.volume = 0.7; void a.play(); } catch { /* ignore */ }
        }
      }
      llamadasRef.current = newLlamadas;
      setMesas(data);
    }
  }, []);

  useEffect(() => {
    if (step !== "tables" || !empresaId) return;

    void refresh();

    const supabase = getSupabaseAnonClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void refresh(); }, 100);
    };
    const channel = supabase
      .channel(channelNameRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mesa_sesiones' }, debouncedRefresh)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] waiter-login-mesas error:', status);
        }
      });

    // Listen to item-update broadcast so "Platos listos" badge updates when kitchen
    // marks items as preparado — pedido_item_estados changes don't touch mesa_sesiones.
    const broadcastChannel = supabase
      .channel('waiter-items-update')
      .on('broadcast', { event: 'item-update' }, debouncedRefresh)
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(broadcastChannel);
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
        globalThis.dispatchEvent(new CustomEvent('waiter-auth-changed'));
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

  async function handleCloseMesa(mesa: MesaWithSession) {
    if (mesa.itemsDiferidos.length > 0) {
      setCloseBlockedError('Hay ítems retenidos. Libéralos o elimínalos antes de cerrar la mesa.');
      setTimeout(() => setCloseBlockedError(null), 5000);
      return;
    }
    setMesaLoading(mesa.id);
    try {
      // Guard: check if payment is required before allowing close
      const r = await fetch(`/api/mesas/${encodeURIComponent(mesa.id)}/orders`);
      if (r.ok) {
        const data = await r.json() as { orders: { estado: string }[]; pagosHabilitados: boolean; sesionPagada: boolean };
        const unservedStates = new Set(['pendiente_validacion', 'pendiente', 'en_preparacion', 'preparado']);
        if (!data.sesionPagada && data.orders.some(o => unservedStates.has(o.estado))) {
          setCloseBlockedError('Quedan platos por servir. Sirve todos los platos antes de cerrar la mesa.');
          setTimeout(() => setCloseBlockedError(null), 5000);
          return;
        }
        if (data.orders.length > 0 && data.pagosHabilitados && !data.sesionPagada) {
          setCloseBlockedError('Hay pedidos sin pagar. Registra el pago antes de cerrar la mesa.');
          setTimeout(() => setCloseBlockedError(null), 5000);
          return;
        }
      }
      await fetch(`/api/waiter/mesas/${encodeURIComponent(mesa.id)}/close`, { method: 'POST' });
      await refresh();
    } finally {
      setMesaLoading(null);
    }
  }

  async function handleDismissCall(mesa: MesaWithSession) {
    await fetch(`/api/waiter/mesas/${encodeURIComponent(mesa.id)}/dismiss-call`, { method: 'POST' });
    await refresh();
  }

  async function handleViewTicket(mesa: MesaWithSession) {
    setMesaLoading(mesa.id);
    try {
      const res = await fetch("/api/waiter/mesa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesaNumero: mesa.numero }),
      });
      if (res.ok) {
        const data = await res.json() as { mesaId: string; mesaNumero: number; mesaNombre: string | null };
        saveWaiterMesa({ mesaId: data.mesaId, mesaNumero: data.mesaNumero, mesaNombre: data.mesaNombre });
        router.push(`/mesa/${data.mesaId}/orders`);
      }
    } finally {
      setMesaLoading(null);
    }
  }

  async function handleLaunchRetenidos(mesa: MesaWithSession) {
    setLaunching(true);
    try {
      await fetch(`/api/waiter/kitchen/mesas/${encodeURIComponent(mesa.id)}/release-retenidos`, {
        method: 'POST',
      });
      await refresh();
    } finally {
      setLaunching(false);
      setDeferredMesa(null);
    }
  }

  async function handleMesaNav(mesa: MesaWithSession, openCart = false) {
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
        router.push(`/?mesa=${data.mesaId}${openCart ? '&cart=open' : ''}`);
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
      {error && (
        <p className="text-sm text-center" style={{ color: "oklch(65% 0.2 25)" }} role="alert">
          {error}
        </p>
      )}

      {/* State legend */}
      <div className="flex flex-wrap justify-end gap-x-4 gap-y-1.5">
        {[
          { dot: "oklch(38% 0.04 252)", label: "Libre" },
          { dot: "oklch(70% 0.19 148)", label: "Activa",      pulse: true },
          { dot: "oklch(70% 0.19 95)",  label: "Con pedidos", pulse: true },
          { dot: "oklch(70% 0.19 62)",  label: "Pagando",     pulse: true },
          { dot: "oklch(70% 0.19 290)", label: "Pagada" },
        ].map(({ dot, label, pulse }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2 shrink-0">
              {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: dot }} />}
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: dot }} />
            </span>
            <span className="text-[11px]" style={{ color: "oklch(52% 0.05 252)" }}>{label}</span>
          </span>
        ))}
      </div>

      {closeBlockedError && (
        <div
          role="alert"
          className="mb-2 rounded-lg px-3 py-2 text-xs font-medium text-center"
          style={{ background: 'oklch(22% 0.08 25)', color: 'oklch(88% 0.14 25)', border: '1px solid oklch(45% 0.18 25 / 0.5)' }}
        >
          {closeBlockedError}
        </div>
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
              onClick={() => void handleMesaNav(mesa)}
              onClickDeferred={() => setDeferredMesa(mesa)}
              onClickListos={() => {
                const mesaKey = mesa.nombre ?? `Mesa ${mesa.numero}`;
                router.push(`/waiter/kitchen?groupBy=listos&mesa=${encodeURIComponent(mesaKey)}`);
              }}
              onViewTicket={() => void handleViewTicket(mesa)}
              onCloseMesa={() => void handleCloseMesa(mesa)}
              onDismissCall={() => void handleDismissCall(mesa)}
            />
          ))}
        </div>
      )}

      {/* Deferred items dialog */}
      {deferredMesa && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'oklch(0% 0 0 / 0.65)' }}
        >
          <button
            type="button"
            className="absolute inset-0"
            style={{ cursor: 'default' }}
            aria-label="Close"
            onClick={() => { if (!launching) { setDeferredMesa(null); } }}
            onKeyDown={e => { if (e.key === 'Escape' && !launching) { setDeferredMesa(null); } }}
          />
          <dialog
            open
            className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'oklch(18% 0.03 252)', border: '1px solid oklch(42% 0.10 252 / 0.5)' }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Pause className="w-4 h-4 shrink-0" style={{ color: 'oklch(72% 0.16 62)' }} />
                <span className="text-sm font-bold" style={{ color: 'oklch(92% 0.02 252)' }}>
                  Retenidos — {deferredMesa.nombre ?? `Mesa ${deferredMesa.numero}`}
                </span>
              </div>
              <span className="text-xs" style={{ color: 'oklch(55% 0.04 252)' }}>
                {deferredMesa.itemsDiferidos.length} ítem{deferredMesa.itemsDiferidos.length === 1 ? '' : 's'} retenido{deferredMesa.itemsDiferidos.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  const mesaKey = deferredMesa.nombre ?? `Mesa ${deferredMesa.numero}`;
                  router.push(`/waiter/kitchen?groupBy=retenidos&mesa=${encodeURIComponent(mesaKey)}`);
                }}
                className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors text-left"
                style={{ background: 'oklch(22% 0.04 252)', color: 'oklch(80% 0.04 252)', border: '1px solid oklch(38% 0.06 252 / 0.5)' }}
              >
                <ExternalLink className="w-4 h-4 shrink-0" style={{ color: 'oklch(62% 0.08 252)' }} />
                Abrir retenidos
              </button>

              <button
                onClick={() => void handleLaunchRetenidos(deferredMesa)}
                disabled={launching}
                className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-colors text-left disabled:opacity-50"
                style={{ background: 'oklch(21% 0.10 65)', color: 'oklch(80% 0.20 65)', border: '1px solid oklch(50% 0.22 65 / 0.55)' }}
              >
                <PlayCircle className="w-4 h-4 shrink-0" />
                {launching ? 'Lanzando…' : 'Lanzar ítems retenidos de esta mesa'}
              </button>
            </div>

            <button
              onClick={() => setDeferredMesa(null)}
              disabled={launching}
              className="text-xs text-center disabled:opacity-40"
              style={{ color: 'oklch(48% 0.04 252)' }}
            >
              Cancelar
            </button>
          </dialog>
        </div>
      )}

    </div>
  );
}
