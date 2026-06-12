"use client";

import { useEffect, useRef, useState, useCallback, type ReactElement } from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import { ArrowLeft, CreditCard, Receipt, Users, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import { getWaiterMesa } from "@/components/waiter-login-form";
import { QRScannerGate, type QRGateState } from "@/components/qr-scanner-gate";

interface OrderItem {
  nombre: string;
  cantidad: number;
  precio: number;
  complementos?: { nombre: string; precio: number }[];
  translations?: Record<string, { name?: string } | undefined>;
}

interface MesaOrder {
  id: string;
  numeroPedido: number;
  items: OrderItem[];
  estado: string;
  createdAt: string;
}

interface CustomTurno {
  id: string;
  status: 'en_seleccion' | 'en_pago' | 'pagado' | 'cancelado';
  importeCents: number | null;
}

interface ItemPagado {
  pedido_id: string;
  item_idx: number;
  unidades_pagadas: number;
  importe_pagado_cents: number;
}

interface DivisionState {
  personas: number;
  pagosRealizados: number;
  importePorPersona: number;
}

interface MesaSessionData {
  orders: MesaOrder[];
  sesionId: string | null;
  total: number;
  pagosHabilitados: boolean;
  division: DivisionState | null;
  sesionPagada: boolean;
  pagoEnCurso?: boolean;
  divisionTipo?: 'igual' | 'personalizado' | null;
  customTurno?: CustomTurno | null;
  itemsPagados?: ItemPagado[];
}

interface MesaInfo {
  numero: number;
  nombre: string | null;
}

type PendingAction = 'full' | 'division-modal' | 'division-pay';

const PAGE_BG = "#f0ede8";

/**
 * Merges items across all orders in a session so the customer ticket shows
 * one consolidated line per product+complement combination.
 * Key = nombre + precio + sorted complement names — same product ordered in
 * multiple rounds collapses into a single line with summed quantities.
 */
function mergeOrderItems(items: OrderItem[]): OrderItem[] {
  const map = new Map<string, OrderItem>();
  for (const item of items) {
    const compsKey = (item.complementos ?? []).map(c => c.nombre).sort().join(',');
    const key = `${item.nombre}||${item.precio}||${compsKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.cantidad += item.cantidad;
    } else {
      map.set(key, { ...item, complementos: item.complementos ? [...item.complementos] : undefined });
    }
  }
  return [...map.values()];
}

function buildTotalMismatch(
  body: { code?: string; newTotalCents?: number },
  currentTotal: number,
  esDivision: boolean
): { oldTotal: number; newTotal: number; pendingAction: PendingAction } | null {
  if (body.code !== 'TOTAL_MISMATCH' || body.newTotalCents === undefined) return null;
  return {
    oldTotal: currentTotal,
    newTotal: body.newTotalCents / 100,
    pendingAction: esDivision ? 'division-pay' : 'full',
  };
}

function submitRedsysForm(
  formData: { DS_MERCHANT_PARAMETERS: string; DS_SIGNATURE: string; DS_SIGNATURE_VERSION: string },
  redsysUrl: string
): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = redsysUrl;
  const fields: Record<string, string> = {
    Ds_SignatureVersion: formData.DS_SIGNATURE_VERSION,
    Ds_MerchantParameters: formData.DS_MERCHANT_PARAMETERS,
    Ds_Signature: formData.DS_SIGNATURE,
  };
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

// ── Mesa token helpers ──────────────────────────────────────────────────────

const TOKEN_KEY = (mesaId: string) => `mesa_token_${mesaId}`;

function getStoredToken(mesaId: string): { token: string; expiresAt: string } | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY(mesaId));
    if (!raw) return null;
    return JSON.parse(raw) as { token: string; expiresAt: string };
  } catch {
    return null;
  }
}

function storeToken(mesaId: string, token: string, expiresAt: string): void {
  sessionStorage.setItem(TOKEN_KEY(mesaId), JSON.stringify({ token, expiresAt }));
}

function isTokenExpired(expiresAt: string): boolean {
  return new Date(expiresAt) <= new Date();
}

function useMesaToken(mesaId: string) {
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [gateState, setGateState] = useState<QRGateState | null>(null);

  // Check sessionStorage on mount
  useEffect(() => {
    const stored = getStoredToken(mesaId);
    if (!stored || isTokenExpired(stored.expiresAt)) {
      setToken(null);
    } else {
      setToken(stored.token);
      setExpiresAt(stored.expiresAt);
    }
  }, [mesaId]);

  // Auto-expire timer
  useEffect(() => {
    if (!expiresAt) return;
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => {
      setToken(null);
      setExpiresAt(null);
      // Don't open gate immediately — open when next order is attempted
    }, ms);
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const handleTokenIssued = useCallback((newToken: string, newExpiresAt: string) => {
    storeToken(mesaId, newToken, newExpiresAt);
    setToken(newToken);
    setExpiresAt(newExpiresAt);
    setGateState(null);
  }, [mesaId]);

  const requireToken = useCallback((): string | null => {
    const stored = getStoredToken(mesaId);
    if (!stored || isTokenExpired(stored.expiresAt)) {
      setGateState('TOKEN_EXPIRED');
      return null;
    }
    return stored.token;
  }, [mesaId]);

  const handleAuthError = useCallback((code?: string) => {
    if (code === 'SESSION_CLOSED') {
      setGateState('SESSION_CLOSED');
    } else {
      setGateState('TOKEN_EXPIRED');
    }
    setToken(null);
    setExpiresAt(null);
  }, []);

  return { token, gateState, handleTokenIssued, requireToken, handleAuthError };
}

function PerforatedEdge({ position }: Readonly<{ position: "top" | "bottom" }>) {
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

// Personas selector modal
function DivisionModal({
  total,
  lang,
  onConfirm,
  onClose,
}: Readonly<{
  total: number;
  lang: Parameters<typeof t>[1];
  onConfirm: (n: number) => void;
  onClose: () => void;
}>) {
  const [selected, setSelected] = useState(2);
  const perPersona = Math.round((total / selected) * 100) / 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <button
        type="button"
        className="absolute inset-0 w-full h-full"
        style={{ background: 'transparent', border: 'none', cursor: 'default' }}
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 pb-10 relative"
        style={{ backgroundColor: "#fffcf7", fontFamily: "monospace", zIndex: 1 }}
      >
        {/* Handle */}
        <div
          className="mx-auto mb-5 rounded-full"
          style={{ width: 40, height: 4, backgroundColor: "#c9b99a" }}
        />

        <p
          className="text-center text-xs tracking-widest uppercase mb-5"
          style={{ color: "#8a7560" }}
        >
          {t("mesaDivisionTitle", lang)}
        </p>

        {/* Number selector */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <button
            type="button"
            onClick={() => setSelected((n) => Math.max(2, n - 1))}
            className="flex items-center justify-center rounded-full text-xl font-bold transition-opacity disabled:opacity-30"
            style={{
              width: 44,
              height: 44,
              backgroundColor: "#1a1612",
              color: "#fffcf7",
            }}
            disabled={selected <= 2}
            aria-label="Menos personas"
          >
            −
          </button>

          <div className="flex flex-col items-center" style={{ minWidth: 60 }}>
            <span
              className="text-4xl font-bold tabular-nums"
              style={{ color: "#1a1612" }}
            >
              {selected}
            </span>
            <span className="text-xs uppercase tracking-widest" style={{ color: "#8a7560" }}>
              {t("mesaDivisionPersonas", lang)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSelected((n) => Math.min(20, n + 1))}
            className="flex items-center justify-center rounded-full text-xl font-bold transition-opacity disabled:opacity-30"
            style={{
              width: 44,
              height: 44,
              backgroundColor: "#1a1612",
              color: "#fffcf7",
            }}
            disabled={selected >= 20}
            aria-label="Más personas"
          >
            +
          </button>
        </div>

        <p className="text-center text-sm mb-6" style={{ color: "#8a7560", fontFamily: "monospace" }}>
          {formatPrice(perPersona, "EUR", lang)}{" "}
          <span className="text-xs">{t("mesaDivisionPorPersona", lang)}</span>
        </p>

        <button
          type="button"
          onClick={() => onConfirm(selected)}
          className="w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase"
          style={{ backgroundColor: "#1a1612", color: "#fffcf7" }}
        >
          {t("mesaDivisionConfirm", lang)}
        </button>
      </div>
    </div>
  );
}

function DivisionTypeModal({
  onSelectEqual,
  onSelectCustom,
  onClose,
  lang,
}: {
  onSelectEqual: () => void;
  onSelectCustom: () => void;
  onClose: () => void;
  lang: Parameters<typeof t>[1];
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <h2 className="mb-5 text-center text-lg font-semibold text-[#1a1612]">
          {t("mesaDivisionTypeTitle", lang)}
        </h2>
        <div className="flex flex-col gap-3">
          <button onClick={onSelectEqual}
            className="flex flex-col items-start rounded-xl border border-[#e8e0d8] bg-[#f8f4ef] p-4 text-left active:scale-[0.98]">
            <span className="font-semibold text-[#1a1612]">{t("mesaDivisionTypeEqual", lang)}</span>
            <span className="text-sm text-[#8a7d6b]">{t("mesaDivisionTypeEqualDesc", lang)}</span>
          </button>
          <button onClick={onSelectCustom}
            className="flex flex-col items-start rounded-xl border border-[#1a1612] bg-[#1a1612] p-4 text-left active:scale-[0.98]">
            <span className="font-semibold text-white">{t("mesaDivisionTypeCustom", lang)}</span>
            <span className="text-sm text-[#c8b99a]">{t("mesaDivisionTypeCustomDesc", lang)}</span>
          </button>
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 text-sm text-[#8a7d6b]">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function CustomItemRow({
  nombre, precio, totalUnidades, unidadesPagadas, unidadesSeleccionadas, onChangeUnidades, lang,
}: {
  nombre: string; precio: number; totalUnidades: number; unidadesPagadas: number;
  unidadesSeleccionadas: number; onChangeUnidades: (n: number) => void; lang: Parameters<typeof t>[1];
}) {
  const disponibles = totalUnidades - unidadesPagadas;

  if (disponibles <= 0) {
    return (
      <div className="flex items-center justify-between py-2 opacity-40">
        <span className="text-sm line-through">{totalUnidades}× {nombre}</span>
        <span className="text-xs text-[#8a7d6b]">{t("mesaCustomItemPaid", lang)}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1">
        <p className="text-sm font-medium text-[#1a1612]">{nombre}</p>
        <p className="text-xs text-[#8a7d6b]">
          {formatPrice(precio, "EUR", lang)} · {disponibles} disponible{disponibles !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button onClick={() => onChangeUnidades(Math.max(0, unidadesSeleccionadas - 1))}
          disabled={unidadesSeleccionadas === 0}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e0d8] text-[#1a1612] disabled:opacity-30">−</button>
        <span className="w-6 text-center text-sm font-semibold">{unidadesSeleccionadas}</span>
        <button onClick={() => onChangeUnidades(Math.min(disponibles, unidadesSeleccionadas + 1))}
          disabled={unidadesSeleccionadas >= disponibles}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1612] text-white disabled:opacity-30">+</button>
      </div>
    </div>
  );
}

function CustomSelectionView({
  orders, itemsPagados, turnoId, mesaId, lang, onCancelled, onCommitted,
}: {
  orders: MesaOrder[];
  itemsPagados: ItemPagado[];
  turnoId: string;
  mesaId: string;
  lang: Parameters<typeof t>[1];
  onCancelled: () => void;
  onCommitted: (formData: { DS_MERCHANT_PARAMETERS: string; DS_SIGNATURE: string; DS_SIGNATURE_VERSION: string }) => void;
}) {
  const [selection, setSelection] = useState<Map<string, number>>(new Map());
  const [committing, setCommitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getPaidUnits = (pedidoId: string, itemIdx: number) =>
    itemsPagados
      .filter(p => p.pedido_id === pedidoId && p.item_idx === itemIdx)
      .reduce((s, p) => s + p.unidades_pagadas, 0);

  const subtotalCents = Array.from(selection.entries()).reduce((sum, [key, units]) => {
    const [pedidoId, idxStr] = key.split(':');
    const order = orders.find(o => o.id === pedidoId);
    const item = order?.items[Number(idxStr)];
    return sum + Math.round((item?.precio ?? 0) * 100) * units;
  }, 0);

  const handleChange = (pedidoId: string, itemIdx: number, units: number) => {
    const key = `${pedidoId}:${itemIdx}`;
    const next = new Map(selection);
    if (units === 0) next.delete(key); else next.set(key, units);
    setSelection(next);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const seleccion = Array.from(next.entries()).map(([k, u]) => {
      const [pid, idx] = k.split(':');
      return { pedido_id: pid, item_idx: Number(idx), unidades: u };
    });
    const totalCents = Array.from(next.entries()).reduce((sum, [k, u]) => {
      const [pid, idxStr] = k.split(':');
      const order = orders.find(o => o.id === pid);
      const item = order?.items[Number(idxStr)];
      return sum + Math.round((item?.precio ?? 0) * 100) * u;
    }, 0);
    saveTimerRef.current = setTimeout(() => {
      void fetch(
        `/api/mesas/${encodeURIComponent(mesaId)}/custom-turn/${encodeURIComponent(turnoId)}/selection`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seleccion, importeCents: totalCents }) }
      );
    }, 500);
  };

  const handlePay = async () => {
    setCommitting(true);
    try {
      const res = await fetch(
        `/api/mesas/${encodeURIComponent(mesaId)}/custom-turn/${encodeURIComponent(turnoId)}/commit`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importeCents: subtotalCents }) }
      );
      if (!res.ok) { setCommitting(false); return; }
      const body = await res.json() as { type?: string; DS_MERCHANT_PARAMETERS?: string; DS_SIGNATURE?: string; DS_SIGNATURE_VERSION?: string; paymentOrderRef?: string };
      if (body.DS_MERCHANT_PARAMETERS && body.DS_SIGNATURE && body.DS_SIGNATURE_VERSION) {
        if (body.paymentOrderRef) {
          try { sessionStorage.setItem(`mesa-custom-turno-${mesaId}`, turnoId); } catch { /* ignore */ }
        }
        onCommitted({ DS_MERCHANT_PARAMETERS: body.DS_MERCHANT_PARAMETERS, DS_SIGNATURE: body.DS_SIGNATURE, DS_SIGNATURE_VERSION: body.DS_SIGNATURE_VERSION });
      }
    } catch { setCommitting(false); }
  };

  const handleCancel = async () => {
    setCancelling(true);
    await fetch(
      `/api/mesas/${encodeURIComponent(mesaId)}/custom-turn/${encodeURIComponent(turnoId)}`,
      { method: 'DELETE' }
    );
    try { sessionStorage.removeItem(`mesa-custom-turno-${mesaId}`); } catch { /* ignore */ }
    onCancelled();
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f0ede8]">
      <div className="sticky top-0 z-10 bg-[#f0ede8] px-4 pt-4 pb-2 border-b border-[#e8e0d8]">
        <h2 className="text-lg font-semibold text-[#1a1612]">{t("mesaCustomSelectTitle", lang)}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2 divide-y divide-[#e8e0d8]">
        {orders.map(order =>
          order.items.map((item, idx) => (
            <CustomItemRow
              key={`${order.id}:${idx}`}
              nombre={item.nombre}
              precio={item.precio}
              totalUnidades={item.cantidad}
              unidadesPagadas={getPaidUnits(order.id, idx)}
              unidadesSeleccionadas={selection.get(`${order.id}:${idx}`) ?? 0}
              onChangeUnidades={units => handleChange(order.id, idx, units)}
              lang={lang}
            />
          ))
        )}
      </div>
      <div className="sticky bottom-0 bg-white border-t border-[#e8e0d8] p-4 flex flex-col gap-2">
        <div className="flex justify-between text-sm text-[#8a7d6b] mb-1">
          <span>{t("mesaCustomSubtotal", lang)}</span>
          <span className="font-semibold text-[#1a1612]">{formatPrice(subtotalCents / 100, "EUR", lang)}</span>
        </div>
        <button onClick={() => { void handlePay(); }}
          disabled={subtotalCents === 0 || committing}
          className="w-full rounded-xl bg-[#1a1612] py-4 text-sm font-semibold text-white disabled:opacity-40">
          {t("mesaCustomPay", lang).replace("{amount}", formatPrice(subtotalCents / 100, "EUR", lang))}
        </button>
        <button onClick={() => { void handleCancel(); }} disabled={cancelling}
          className="w-full py-2 text-sm text-[#8a7d6b]">
          {t("mesaCustomCancel", lang)}
        </button>
      </div>
    </div>
  );
}

function CustomWaitingView({ lang }: { lang: Parameters<typeof t>[1] }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1a1612] border-t-transparent" />
      <p className="font-medium text-[#1a1612]">{t("mesaCustomWaiting", lang)}</p>
    </div>
  );
}

function RemainingItemsActions({
  orders, itemsPagados, total, lang, onClaimTurn, onSwitchToEqual,
}: {
  orders: MesaOrder[];
  itemsPagados: ItemPagado[];
  total: number;
  lang: Parameters<typeof t>[1];
  onClaimTurn: () => void;
  onSwitchToEqual: (numPersonas: number) => void;
}) {
  const [showSplitInput, setShowSplitInput] = useState(false);
  const [numPersonas, setNumPersonas] = useState(2);

  const paidCents = itemsPagados.reduce((s, p) => s + p.importe_pagado_cents, 0);
  const remainingCents = Math.round(total * 100) - paidCents;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-xl bg-[#f8f4ef] p-4">
        <p className="mb-2 text-sm font-semibold text-[#1a1612]">
          {t("mesaRemainingAmount", lang).replace("{amount}", formatPrice(remainingCents / 100, "EUR", lang))}
        </p>
        <div className="divide-y divide-[#e8e0d8]">
          {orders.flatMap(order =>
            order.items.map((item, idx) => {
              const paid = itemsPagados
                .filter(p => p.pedido_id === order.id && p.item_idx === idx)
                .reduce((s, p) => s + p.unidades_pagadas, 0);
              const remaining = item.cantidad - paid;
              if (remaining <= 0) return null;
              return (
                <div key={`${order.id}:${idx}`} className="flex justify-between py-2 text-sm">
                  <span>{remaining}× {item.nombre}</span>
                  <span>{formatPrice(item.precio * remaining, "EUR", lang)}</span>
                </div>
              );
            }).filter((x): x is ReactElement => x !== null)
          )}
        </div>
      </div>

      <button onClick={onClaimTurn}
        className="w-full rounded-xl bg-[#1a1612] py-4 text-sm font-semibold text-white">
        {t("mesaRemainingMyTurn", lang)}
      </button>

      {!showSplitInput ? (
        <button onClick={() => setShowSplitInput(true)}
          className="w-full rounded-xl border border-[#1a1612] py-4 text-sm font-semibold text-[#1a1612]">
          {t("mesaRemainingEqualSplit", lang)}
        </button>
      ) : (
        <div className="rounded-xl border border-[#e8e0d8] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("mesaDivisionPersonas", lang)}</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setNumPersonas(n => Math.max(2, n - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#e8e0d8]">−</button>
              <span className="w-6 text-center font-semibold">{numPersonas}</span>
              <button onClick={() => setNumPersonas(n => Math.min(20, n + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1612] text-white">+</button>
            </div>
          </div>
          <p className="text-center text-xs text-[#8a7d6b]">
            {formatPrice(remainingCents / 100 / numPersonas, "EUR", lang)} {t("mesaDivisionPorPersona", lang)}
          </p>
          <button onClick={() => onSwitchToEqual(numPersonas)}
            className="w-full rounded-xl bg-[#1a1612] py-3 text-sm font-semibold text-white">
            {t("mesaDivisionConfirm", lang)}
          </button>
        </div>
      )}
    </div>
  );
}

export function MesaOrdersClient({ mesaId }: Readonly<{ mesaId: string }>) {
  const { language } = useLanguage();
  const lang = language;
  const { gateState, handleTokenIssued, requireToken, handleAuthError } = useMesaToken(mesaId);
  const [sessionData, setSessionData] = useState<MesaSessionData | null>(null);
  const [mesaInfo, setMesaInfo] = useState<MesaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [showDivisionTypeModal, setShowDivisionTypeModal] = useState(false);
  const [claimingTurn, setClaimingTurn] = useState(false);
  const [activeTurnoId, setActiveTurnoId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(`mesa-custom-turno-${mesaId}`); } catch { return null; }
  });
  const [settingDivision, setSettingDivision] = useState(false);
  const [cancellingDivision, setCancellingDivision] = useState(false);
  const [manualPaying, setManualPaying] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ nombre: string; precio: number; maxCantidad: number; complementos?: { nombre: string; precio: number }[]; preparadoWarning?: boolean } | null>(null);
  const [deleteQty, setDeleteQty] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [verifyingTotal, setVerifyingTotal] = useState(false);
  const [totalMismatch, setTotalMismatch] = useState<{
    oldTotal: number;
    newTotal: number;
    pendingAction: PendingAction;
  } | null>(() => {
    // Restore mismatch warning if the payer navigated away and came back (back button)
    try {
      if (sessionStorage.getItem(`mesa-lock-${mesaId}`) === 'true') {
        const stored = sessionStorage.getItem(`mesa-mismatch-${mesaId}`);
        if (stored) return JSON.parse(stored) as { oldTotal: number; newTotal: number; pendingAction: PendingAction };
      }
    } catch { /* ignore */ }
    return null;
  });
  // true while THIS user owns the checkout lock (they clicked "Pagar" / "Dividir cuenta").
  // Persisted in sessionStorage so it survives in-app navigation (back button recovery).
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(() => {
    try { return sessionStorage.getItem(`mesa-lock-${mesaId}`) === 'true'; }
    catch { return false; }
  });

  // True when the current session belongs to a waiter impersonating this table.
  // Waiters should not see payment buttons — the customer pays, not the waiter.
  const isWaiterMode = (() => {
    try { return getWaiterMesa()?.mesaId === mesaId; }
    catch { return false; }
  })();

  // Derived early so the polling effect can use it as a dependency
  const pagoEnCursoForPoll = sessionData?.pagoEnCurso ?? false;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (res.ok) setSessionData(await res.json() as MesaSessionData);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [mesaId]);

  const releaseCheckoutLock = useCallback(() => {
    setIsInitiatingPayment(false);
    try {
      sessionStorage.removeItem(`mesa-lock-${mesaId}`);
      sessionStorage.removeItem(`mesa-mismatch-${mesaId}`);
    } catch { /* ignore */ }
    void fetch(`/api/mesas/${encodeURIComponent(mesaId)}/lock`, { method: 'DELETE' }).catch(() => null);
  }, [mesaId]);

  useEffect(() => {
    void refresh();
    // Poll every 3s while a payment is in progress — so the overlay
    // disappears within seconds of the payment completing or being cancelled.
    // Otherwise poll every 10s to reduce server load.
    const interval = setInterval(() => { void refresh(); }, pagoEnCursoForPoll ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [refresh, pagoEnCursoForPoll]);

  // Realtime: refresh immediately when the session row changes (division progress,
  // sesion_pagada, pago_en_curso). This eliminates the 10s polling gap for concurrent payers.
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    const channel = supabase
      .channel(`mesa-orders-${mesaId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mesa_sesiones', filter: `mesa_id=eq.${mesaId}` },
        () => { void refresh(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [mesaId, refresh]);

  useEffect(() => {
    const sesionId = sessionData?.sesionId;
    if (!sesionId) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    const channel = supabase
      .channel(`mesa-item-pagos-${sesionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mesa_item_pagos', filter: `sesion_id=eq.${sesionId}` },
        () => { void refresh(); }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionData?.sesionId, refresh]);

  // On mount: if there is a stored division paymentOrderRef from a previous payment
  // attempt, release that pending slot. Covers two cases:
  //   1. User cancelled at Redsys (urlKo redirect back to this page).
  //   2. User silently abandoned (closed the app, lost connectivity).
  // The update is atomic (WHERE status='pending') — a no-op if the webhook
  // already marked the row as 'paid' or 'failed'.
  useEffect(() => {
    const storedRef = (() => {
      try { return sessionStorage.getItem(`mesa-division-ref-${mesaId}`); }
      catch { return null; }
    })();
    if (!storedRef) return;
    void fetch(`/api/mesas/${encodeURIComponent(mesaId)}/division-slot`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentOrderRef: storedRef }),
    }).then(() => {
      try { sessionStorage.removeItem(`mesa-division-ref-${mesaId}`); } catch { /* ignore */ }
    }).catch(() => { /* non-blocking */ });
  }, [mesaId]);

  // Refs to read current state in the unmount cleanup (avoids stale closures)
  const isInitiatingPaymentRef = useRef(isInitiatingPayment);
  const payingRef = useRef(paying);
  useEffect(() => { isInitiatingPaymentRef.current = isInitiatingPayment; }, [isInitiatingPayment]);
  useEffect(() => { payingRef.current = paying; }, [paying]);

  // If the payer navigates away while owning the lock (but before reaching Redsys),
  // release the lock so others aren't stuck. If paying=true, they're at Redsys — keep the lock.
  useEffect(() => {
    return () => {
      if (isInitiatingPaymentRef.current && !payingRef.current) {
        try { sessionStorage.removeItem(`mesa-lock-${mesaId}`); } catch { /* */ }
        void fetch(`/api/mesas/${encodeURIComponent(mesaId)}/lock`, { method: 'DELETE' }).catch(() => null);
      }
    };
  }, [mesaId]);

  useEffect(() => {
    fetch(`/api/mesas?token=${encodeURIComponent(mesaId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { numero: number; nombre: string | null } | null) => {
        if (d) setMesaInfo({ numero: d.numero, nombre: d.nombre });
      })
      .catch(() => null);
  }, [mesaId]);

  const initiateRedsys = async (esDivision: boolean, expectedTotalCents?: number) => {
    if (paying) return;
    const clientToken = requireToken();
    if (!clientToken) return; // gate is now open
    setPaying(true);
    try {
      const res = await fetch('/api/redsys/initiate-mesa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clientToken}`,
        },
        body: JSON.stringify({ mesaId, esDivision, expectedTotalCents }),
      });
      if (res.status === 401) {
        const body = await res.json() as { code?: string };
        handleAuthError(body.code);
        setPaying(false);
        return;
      }
      if (res.status === 409) {
        const body = await res.json() as { code?: string; newTotalCents?: number };
        if (body.code === 'ALREADY_PAID') {
          // Session completed (e.g. waiter registered manual payment) while this user
          // was on the checkout flow — release lock and refresh to show paid screen.
          releaseCheckoutLock();
          setPaying(false);
          void refresh();
          return;
        }
        // An order committed to DB between the client's total check and Redsys initiation.
        // Show the updated total so the user can review and confirm before paying.
        const mismatch = buildTotalMismatch(body, sessionData?.total ?? 0, esDivision);
        if (mismatch) {
          setSessionData(prev => prev ? { ...prev, total: mismatch.newTotal } : prev);
          setTotalMismatch(mismatch);
          try { sessionStorage.setItem(`mesa-mismatch-${mesaId}`, JSON.stringify(mismatch)); } catch { /* ignore */ }
        }
        setPaying(false);
        return;
      }
      if (res.status === 423) {
        // Another payment started between verification and now
        releaseCheckoutLock();
        setPaying(false);
        void refresh();
        return;
      }
      if (!res.ok) { setPaying(false); return; }
      const formData = await res.json() as {
        DS_MERCHANT_PARAMETERS: string;
        DS_SIGNATURE: string;
        DS_SIGNATURE_VERSION: string;
        paymentOrderRef?: string;
      };
      // Store the ref so we can release the pending slot if the user cancels or abandons
      // the Redsys flow. The cleanup runs automatically on the next mount of this component.
      if (esDivision && formData.paymentOrderRef) {
        try { sessionStorage.setItem(`mesa-division-ref-${mesaId}`, formData.paymentOrderRef); } catch { /* ignore */ }
      }
      const redsysUrl = process.env.NEXT_PUBLIC_REDSYS_URL ?? 'https://sis-t.redsys.es:25443/sis/realizarPago';
      submitRedsysForm(formData, redsysUrl);
    } catch {
      setPaying(false);
    }
  };

  const handleConfirmDivision = async (numPersonas: number) => {
    setShowDivisionModal(false);
    setSettingDivision(true);
    try {
      // Re-verify total hasn't changed while the modal was open
      const checkRes = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (checkRes.ok) {
        const fresh = await checkRes.json() as MesaSessionData;
        const currentTotal = sessionData?.total ?? 0;
        if (Math.abs(fresh.total - currentTotal) > 0.005) {
          setSessionData(fresh);
          const mismatch = { oldTotal: currentTotal, newTotal: fresh.total, pendingAction: 'division-modal' as PendingAction };
          setTotalMismatch(mismatch);
          try { sessionStorage.setItem(`mesa-mismatch-${mesaId}`, JSON.stringify(mismatch)); } catch { /* ignore */ }
          return;
        }
        setSessionData(fresh);
      }
      await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/division`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numPersonas }),
      });
      // Division is set — release the checkout lock.
      // Other users are already on the ticket via divisionActiva redirect.
      releaseCheckoutLock();
      await refresh();
    } finally {
      setSettingDivision(false);
    }
  };

  const executePendingAction = (action: PendingAction) => {
    setTotalMismatch(null);
    try { sessionStorage.removeItem(`mesa-mismatch-${mesaId}`); } catch { /* ignore */ }
    // Use the current sessionData.total (already updated to the fresh total after any mismatch)
    const expectedCents = sessionData ? Math.round(sessionData.total * 100) : undefined;
    if (action === 'full') {
      void initiateRedsys(false, expectedCents);
    } else if (action === 'division-modal') {
      setShowDivisionModal(true);
    } else {
      void initiateRedsys(true, expectedCents);
    }
  };

  const handlePrePaymentCheck = async (action: PendingAction) => {
    if (paying || verifyingTotal) return;
    setVerifyingTotal(true);
    try {
      // Acquire checkout lock — signals all other users on this mesa to redirect to ticket.
      // Skip for division-pay: each share is independent and the DB-level mesa_division_pagos
      // table already handles concurrency. Using a global lock would block simultaneous payers.
      // Skip if we already own it (e.g. re-checking after a totalMismatch confirmation).
      if (!isInitiatingPayment && action !== 'division-pay') {
        const lockRes = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/lock`, { method: 'POST' });
        if (lockRes.status === 423) {
          void refresh();
          return;
        }
        setIsInitiatingPayment(true);
        try { sessionStorage.setItem(`mesa-lock-${mesaId}`, 'true'); } catch { /* ignore */ }
      }
      // Verify total against fresh DB state
      const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (!res.ok) { executePendingAction(action); return; }
      const fresh = await res.json() as MesaSessionData;

      // Guard: session may have been paid (e.g. waiter manual payment) while this
      // user was going through the checkout flow — bail out and show the paid screen.
      const freshFullyPaid = fresh.sesionPagada ||
        (fresh.division ? fresh.division.pagosRealizados >= fresh.division.personas : false);
      if (freshFullyPaid) {
        setSessionData(fresh);
        releaseCheckoutLock();
        return;
      }

      const currentTotal = sessionData?.total ?? 0;
      if (Math.abs(fresh.total - currentTotal) > 0.005) {
        setSessionData(fresh);
        const mismatch = { oldTotal: currentTotal, newTotal: fresh.total, pendingAction: action };
        setTotalMismatch(mismatch);
        try { sessionStorage.setItem(`mesa-mismatch-${mesaId}`, JSON.stringify(mismatch)); } catch { /* ignore */ }
      } else {
        setSessionData(fresh);
        executePendingAction(action);
      }
    } catch {
      executePendingAction(action);
    } finally {
      setVerifyingTotal(false);
    }
  };

  const handleCancelDivision = async () => {
    setCancellingDivision(true);
    try {
      await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/division`, { method: 'DELETE' });
      await refresh();
    } finally {
      setCancellingDivision(false);
    }
  };

  const handleClaimCustomTurn = useCallback(async () => {
    setClaimingTurn(true);
    try {
      const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/custom-turn`, { method: 'POST' });
      if (!res.ok) { void refresh(); return; } // 409 means lock held — refresh to show waiting view
      const body = await res.json() as { turnoId: string };
      setActiveTurnoId(body.turnoId);
      try { sessionStorage.setItem(`mesa-custom-turno-${mesaId}`, body.turnoId); } catch { /* ignore */ }
      void refresh();
    } finally {
      setClaimingTurn(false);
    }
  }, [mesaId, refresh]);

  const handleSwitchToEqualRemaining = useCallback(async (numPersonas: number) => {
    const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/equal-split-remaining`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numPersonas }),
    });
    if (res.ok) void refresh();
  }, [mesaId, refresh]);

  const handleDeleteItem = useCallback(async () => {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/orders/items`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: pendingDelete.nombre,
          precio: pendingDelete.precio,
          cantidadAEliminar: deleteQty,
        }),
      });
      setPendingDelete(null);
      await refresh();
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, deleteQty, deleting, mesaId, refresh]);

  const handleManualPayment = async () => {
    if (manualPaying) return;
    setManualPaying(true);
    try {
      await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/manual-payment`, { method: 'POST' });
      await refresh();
    } finally {
      setManualPaying(false);
    }
  };

  const division = sessionData?.division ?? null;

  // Another user is paying — we should wait without being able to navigate away.
  // Exclude: when WE own the lock (isInitiatingPayment) or we're submitting the form (paying).
  // Division mode: each person pays their share independently — a concurrent payer
  // must not see this as a blocker. Only block for full (non-division) payments.
  const externalPaymentInProgress = (sessionData?.pagoEnCurso ?? false) && !paying && !isInitiatingPayment && !division;
  const fullyPaid = (sessionData?.sesionPagada ?? false) || (division
    ? division.pagosRealizados >= division.personas
    : false);

  // Trap the browser back button while a payment is in progress or the table is fully paid.
  // Fully paid: customer must stay on the ticket screen until the waiter closes the table.
  const shouldTrapBack = externalPaymentInProgress || isInitiatingPayment || fullyPaid;
  useEffect(() => {
    if (!shouldTrapBack) return;
    globalThis.history.pushState({ mesaPaymentWaiting: true }, '', globalThis.location.href);
    const handlePopState = () => {
      globalThis.history.pushState({ mesaPaymentWaiting: true }, '', globalThis.location.href);
    };
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [shouldTrapBack]);

  const allItems = mergeOrderItems(sessionData?.orders.flatMap((o) => o.items) ?? []);

  const firstOrderDate = sessionData?.orders[0]?.createdAt
    ? new Date(sessionData.orders[0].createdAt)
    : null;
  const dateStr = firstOrderDate?.toLocaleDateString(language, { day: "2-digit", month: "2-digit", year: "numeric" }) ?? "";
  const timeStr = firstOrderDate?.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "";
  const tableLabel = mesaInfo?.nombre ?? (mesaInfo ? `Mesa ${mesaInfo.numero}` : "Mesa");

  let manualPayLabel: string;
  if (manualPaying) {
    manualPayLabel = "Registrando...";
  } else if (division) {
    manualPayLabel = `Pago manual · ${formatPrice(division.importePorPersona, "EUR", lang)}`;
  } else {
    manualPayLabel = "Marcar pagada (efectivo)";
  }

  // Custom selection: this user holds the lock
  if (activeTurnoId && sessionData?.customTurno?.id === activeTurnoId && sessionData.customTurno.status === 'en_seleccion') {
    const redsysUrl = process.env.NEXT_PUBLIC_REDSYS_URL ?? 'https://sis-t.redsys.es:25443/sis/realizarPago';
    return (
      <CustomSelectionView
        orders={sessionData.orders}
        itemsPagados={sessionData.itemsPagados ?? []}
        turnoId={activeTurnoId}
        mesaId={mesaId}
        lang={lang}
        onCancelled={() => {
          setActiveTurnoId(null);
          try { sessionStorage.removeItem(`mesa-custom-turno-${mesaId}`); } catch { /* ignore */ }
          void refresh();
        }}
        onCommitted={(formData) => {
          submitRedsysForm(formData, redsysUrl);
        }}
      />
    );
  }

  // Waiting: someone else holds the lock
  if (sessionData?.customTurno?.status === 'en_seleccion' && !activeTurnoId) {
    return (
      <div className="min-h-screen bg-[#f0ede8]">
        <CustomWaitingView lang={lang} />
      </div>
    );
  }

  // Between turns: personalizado mode, no active lock, not fully paid
  if (
    sessionData?.divisionTipo === 'personalizado' &&
    !sessionData?.customTurno &&
    !sessionData?.sesionPagada
  ) {
    return (
      <div className="min-h-screen bg-[#f0ede8]">
        <RemainingItemsActions
          orders={sessionData.orders}
          itemsPagados={sessionData.itemsPagados ?? []}
          total={sessionData.total}
          lang={lang}
          onClaimTurn={() => { void handleClaimCustomTurn(); }}
          onSwitchToEqual={numPersonas => { void handleSwitchToEqualRemaining(numPersonas); }}
        />
      </div>
    );
  }

  return (
    <>
    {gateState && (
      <QRScannerGate
        mesaId={mesaId}
        state={gateState}
        onTokenIssued={handleTokenIssued}
      />
    )}

    {/* Sticky back bar — hidden during payment flows */}
    {!fullyPaid && !externalPaymentInProgress && !division && (
      <div
        className="sticky z-[199]"
        style={{
          top: isWaiterMode ? '3rem' : '0',
          backgroundColor: PAGE_BG,
          borderBottom: "1px solid #e8e0d8",
        }}
      >
        <div className="mx-auto max-w-xs px-4 py-3">
          <Link
            href={`/?mesa=${mesaId}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl transition-all active:scale-[0.97]"
            style={{
              backgroundColor: "#fffcf7",
              border: "1px solid #e8e0d8",
              color: "#1a1612",
              fontFamily: "monospace",
            }}
          >
            <ArrowLeft size={14} strokeWidth={2} />
            <span className="text-xs font-bold tracking-widest uppercase">
              {t("mesaBackToMenu", lang)}
            </span>
          </Link>
        </div>
      </div>
    )}

    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-xs">

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
                <span>{t("mesaTicketPrice", lang)}</span>
              </div>

              {/* Items — waiter: merged with delete buttons; customer: grouped by order with status */}
              {isWaiterMode ? (
                <ul className="flex flex-col gap-1 pb-4">
                  {allItems.map((item) => {
                    const complementoTotal = item.complementos?.reduce((s, c) => s + c.precio, 0) ?? 0;
                    const lineTotal = (item.precio + complementoTotal) * item.cantidad;
                    return (
                      <li
                        key={`${item.nombre}||${item.precio}`}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: "#1a1612", fontFamily: "monospace" }}
                      >
                        {!fullyPaid && !externalPaymentInProgress && (
                          <button
                            type="button"
                            onClick={() => {
                              const isPreparado = sessionData?.orders.some(
                                o => o.estado === 'preparado' && o.items.some(i => i.nombre === item.nombre && Math.abs(i.precio - item.precio) < 0.001)
                              ) ?? false;
                              setPendingDelete({ nombre: item.nombre, precio: item.precio, maxCantidad: item.cantidad, complementos: item.complementos, preparadoWarning: isPreparado });
                              setDeleteQty(1);
                            }}
                            className="flex items-center justify-center shrink-0 w-5 h-5 rounded-full text-xs font-bold"
                            style={{ background: "oklch(35% 0.14 25 / 0.8)", color: "oklch(80% 0.10 25)" }}
                            aria-label={`Eliminar ${item.nombre}`}
                          >
                            −
                          </button>
                        )}
                        <span className="tabular-nums w-4 text-right shrink-0" style={{ color: "#8a7560" }}>
                          {item.cantidad}
                        </span>
                        <span className="flex flex-col flex-1 min-w-0">
                          <span>{(language !== "es" && item.translations?.[language]?.name) || item.nombre}</span>
                          {item.complementos && item.complementos.length > 0 && (
                            <span className="text-xs" style={{ color: "#b0a090" }}>
                              + {item.complementos.map(c => c.nombre).join(", ")}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums shrink-0 text-right" style={{ color: "#1a1612" }}>
                          {formatPrice(lineTotal, "EUR", lang)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="flex flex-col gap-1 pb-4">
                  {allItems.map((item) => {
                    const complementoTotal = item.complementos?.reduce((s, c) => s + c.precio, 0) ?? 0;
                    const lineTotal = (item.precio + complementoTotal) * item.cantidad;
                    const compsKey = (item.complementos ?? []).map(c => c.nombre).sort().join(',');
                    return (
                      <li
                        key={`${item.nombre}||${item.precio}||${compsKey}`}
                        className="flex items-center gap-2 text-sm"
                        style={{ color: "#1a1612", fontFamily: "monospace" }}
                      >
                        <span className="tabular-nums w-4 text-right shrink-0" style={{ color: "#8a7560" }}>
                          {item.cantidad}
                        </span>
                        <span className="flex flex-col flex-1 min-w-0">
                          <span>{(language !== "es" && item.translations?.[language]?.name) || item.nombre}</span>
                          {item.complementos && item.complementos.length > 0 && (
                            <span className="text-xs" style={{ color: "#b0a090" }}>
                              + {item.complementos.map(c => c.nombre).join(", ")}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums shrink-0 text-right" style={{ color: "#1a1612" }}>
                          {formatPrice(lineTotal, "EUR", lang)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

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

        {/* Payment section */}
        {allItems.length > 0 && (sessionData?.pagosHabilitados || isWaiterMode) && (
          <div
            className="mt-6 rounded-3xl overflow-hidden"
            style={{ border: "1px solid #e8e0d8" }}
          >
          <div className="flex flex-col gap-3 p-5">

            {/* Secure payment header — customer-facing only, not waiter */}
            {sessionData?.pagosHabilitados && !isWaiterMode && !fullyPaid && (
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldCheck size={12} strokeWidth={2} style={{ color: "#8a7560" }} />
                <span
                  className="text-[10px] uppercase tracking-[0.18em]"
                  style={{ color: "#8a7560", fontFamily: "monospace" }}
                >
                  Pago seguro
                </span>
              </div>
            )}

            {/* Division block */}
            {division && (
              <div
                className="rounded-2xl p-5"
                style={{ backgroundColor: "#fffcf7", fontFamily: "monospace" }}
              >
                {/* Prominent person count */}
                <div className="flex flex-col items-center mb-4">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      className="tabular-nums font-bold"
                      style={{ fontSize: 48, lineHeight: 1, color: "#1a1612" }}
                    >
                      {division.personas}
                    </span>
                    <span
                      className="text-sm uppercase tracking-widest"
                      style={{ color: "#8a7560" }}
                    >
                      {t("mesaDivisionPersonas", lang)}
                    </span>
                  </div>
                  <p className="text-sm font-bold tabular-nums" style={{ color: "#1a1612" }}>
                    {formatPrice(division.importePorPersona, "EUR", lang)}{" "}
                    <span className="text-xs font-normal" style={{ color: "#8a7560" }}>
                      {t("mesaDivisionPorPersona", lang)}
                    </span>
                  </p>
                </div>

                {/* Progress track */}
                <div
                  className="rounded-full overflow-hidden mb-3"
                  style={{ height: 6, backgroundColor: "#e8e0d8" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (division.pagosRealizados / division.personas) * 100)}%`,
                      backgroundColor: fullyPaid ? "#4ade80" : "#1a1612",
                    }}
                  />
                </div>

                {/* Individual share dots */}
                <div className="flex gap-1.5 justify-center mb-3">
                  {Array.from({ length: division.personas }, (_, n) => n + 1).map(shareNum => (
                    <div
                      key={`share-${shareNum}`}
                      className="rounded-full transition-colors duration-300"
                      style={{
                        width: 10,
                        height: 10,
                        backgroundColor: shareNum <= division.pagosRealizados ? "#1a1612" : "#e8e0d8",
                      }}
                    />
                  ))}
                </div>

                {/* Progress label */}
                <p className="text-center text-xs uppercase tracking-widest" style={{ color: "#8a7560" }}>
                  {fullyPaid
                    ? <span className="font-bold" style={{ color: "#4ade80" }}>{t("mesaDivisionComplete", lang)}</span>
                    : <>{division.pagosRealizados}/{division.personas} {t("mesaDivisionProgress", lang).toLowerCase()}</>
                  }
                </p>

                {/* Edit / Cancel actions — only before any payment and when no payment is in progress */}
                {division.pagosRealizados === 0 && !fullyPaid && !externalPaymentInProgress && (
                  <div className="flex justify-center gap-4 mt-3 pt-3" style={{ borderTop: "1px dashed #e8e0d8" }}>
                    <button
                      type="button"
                      onClick={() => setShowDivisionModal(true)}
                      disabled={settingDivision || cancellingDivision}
                      className="text-xs underline underline-offset-2 transition-opacity disabled:opacity-40"
                      style={{ color: "#8a7560" }}
                    >
                      {t("mesaDivisionEdit", lang)}
                    </button>
                    <span style={{ color: "#c9b99a" }}>·</span>
                    <button
                      type="button"
                      onClick={() => { void handleCancelDivision(); }}
                      disabled={settingDivision || cancellingDivision}
                      className="text-xs underline underline-offset-2 transition-opacity disabled:opacity-40"
                      style={{ color: "#8a7560" }}
                    >
                      {cancellingDivision ? t("loading", lang) : t("mesaDivisionCancel", lang)}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Payment in progress — another user is paying */}
            {externalPaymentInProgress && (
              <div
                className="rounded-2xl p-5 flex items-center gap-4"
                style={{ backgroundColor: '#1a1612', fontFamily: 'monospace' }}
              >
                <CreditCard size={22} strokeWidth={1.5} style={{ color: '#fffcf7', flexShrink: 0 }} />
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#fffcf7' }}>
                    {t('mesaPagoEnCurso', lang)}
                  </p>
                  <p className="text-xs" style={{ color: '#8a7560' }}>
                    {t('mesaPagoEnCursoDesc', lang)}
                  </p>
                </div>
              </div>
            )}

            {/* Total updated warning */}
            {totalMismatch && (
              <div
                className="rounded-2xl p-5 flex flex-col gap-3"
                style={{ backgroundColor: "#fff8e1", border: "1.5px solid #f59e0b", fontFamily: "monospace" }}
              >
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#92400e" }}>
                  {t("mesaTotalUpdated", lang)}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span style={{ color: "#b0a090", textDecoration: "line-through" }}>
                    {formatPrice(totalMismatch.oldTotal, "EUR", lang)}
                  </span>
                  <span style={{ color: "#78350f" }}>→</span>
                  <span className="font-bold" style={{ color: "#1a1612" }}>
                    {formatPrice(totalMismatch.newTotal, "EUR", lang)}
                  </span>
                </div>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => { executePendingAction(totalMismatch.pendingAction); }}
                    className="flex-1 py-3 rounded-xl text-xs font-bold tracking-widest uppercase"
                    style={{ backgroundColor: "#1a1612", color: "#fffcf7" }}
                  >
                    {t("mesaTotalUpdatedConfirm", lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTotalMismatch(null);
                      releaseCheckoutLock();
                      void refresh();
                    }}
                    className="py-3 px-4 rounded-xl text-xs font-bold tracking-widest uppercase"
                    style={{ backgroundColor: "transparent", color: "#8a7560", border: "1.5px solid #c9b99a" }}
                  >
                    {t("cancel", lang)}
                  </button>
                </div>
              </div>
            )}

            {/* Buttons */}
            {!division && !fullyPaid && !totalMismatch && !externalPaymentInProgress && !isWaiterMode && (
              <div className="flex gap-3">
                {/* Pagar total */}
                <button
                  type="button"
                  onClick={() => { void handlePrePaymentCheck('full'); }}
                  disabled={paying || settingDivision || verifyingTotal}
                  className="flex-1 py-5 rounded-2xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex flex-col items-center gap-2 active:scale-[0.98]"
                  style={{ backgroundColor: "#1a1612", color: "#fffcf7", fontFamily: "monospace" }}
                >
                  {paying || verifyingTotal ? (
                    t("loading", lang)
                  ) : (
                    <>
                      <Receipt size={20} strokeWidth={1.5} />
                      {t("mesaPayTotal", lang)}
                    </>
                  )}
                </button>

                {/* Dividir cuenta */}
                <button
                  type="button"
                  onClick={() => { setShowDivisionTypeModal(true); }}
                  disabled={paying || settingDivision || verifyingTotal}
                  className="flex-1 py-5 rounded-2xl text-xs font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex flex-col items-center gap-2 active:scale-[0.98]"
                  style={{
                    backgroundColor: "transparent",
                    color: "#1a1612",
                    fontFamily: "monospace",
                    border: "2px solid #1a1612",
                  }}
                >
                  {settingDivision || verifyingTotal ? (
                    t("loading", lang)
                  ) : (
                    <>
                      <Users size={20} strokeWidth={1.5} />
                      {t("mesaDivideCheck", lang)}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Pagar mi parte */}
            {division && !fullyPaid && !totalMismatch && !externalPaymentInProgress && !isWaiterMode && (
              <button
                type="button"
                onClick={() => { void handlePrePaymentCheck('division-pay'); }}
                disabled={paying || verifyingTotal}
                className="w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                style={{ backgroundColor: "#1a1612", color: "#fffcf7", fontFamily: "monospace" }}
              >
                {paying || verifyingTotal ? (
                  t("loading", lang)
                ) : (
                  <>
                    <CreditCard size={14} strokeWidth={2} />
                    {`${t("mesaPayShare", lang)} ${formatPrice(division.importePorPersona, "EUR", lang)}`}
                  </>
                )}
              </button>
            )}

            {/* Waiter: custom split breakdown */}
            {isWaiterMode && sessionData?.divisionTipo === 'personalizado' && (
              <div className="mx-4 mb-4 rounded-xl border border-[#e8e0d8] bg-white overflow-hidden">
                <div className="border-b border-[#e8e0d8] bg-[#f8f4ef] px-4 py-3">
                  <p className="text-sm font-semibold text-[#1a1612]">Pago personalizado</p>
                </div>
                <div className="divide-y divide-[#e8e0d8]">
                  {sessionData.orders.flatMap(order =>
                    order.items.map((item, idx) => {
                      const paid = (sessionData.itemsPagados ?? [])
                        .filter(p => p.pedido_id === order.id && p.item_idx === idx)
                        .reduce((s, p) => s + p.unidades_pagadas, 0);
                      const isPaid = paid >= item.cantidad;
                      return (
                        <div key={`${order.id}:${idx}`}
                          className={`flex items-center justify-between px-4 py-2 text-sm ${isPaid ? 'opacity-50' : ''}`}>
                          <span className={isPaid ? 'line-through' : ''}>{item.cantidad}× {item.nombre}</span>
                          <div className="flex items-center gap-2">
                            <span>{formatPrice(item.precio * item.cantidad, "EUR", lang)}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${isPaid ? 'bg-green-100 text-green-700' : 'bg-[#f8f4ef] text-[#8a7d6b]'}`}>
                              {isPaid ? 'pagado' : 'pendiente'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-between border-t border-[#e8e0d8] bg-[#f8f4ef] px-4 py-3 text-sm">
                  <span className="text-[#8a7d6b]">Pendiente</span>
                  <span className="font-semibold text-[#1a1612]">
                    {formatPrice(
                      (Math.round(sessionData.total * 100) - (sessionData.itemsPagados ?? []).reduce((s, p) => s + p.importe_pagado_cents, 0)) / 100,
                      "EUR", lang
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Waiter: manual payment button */}
            {isWaiterMode && !fullyPaid && !externalPaymentInProgress && (
              <button
                type="button"
                onClick={() => { void handleManualPayment(); }}
                disabled={manualPaying}
                className="w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "#1a1612", color: "#fffcf7", fontFamily: "monospace" }}
              >
                {manualPayLabel}
              </button>
            )}

            {/* Fully paid confirmation */}
            {fullyPaid && (
              <div
                className="rounded-2xl p-6 flex flex-col items-center gap-3"
                style={{ backgroundColor: "#fffcf7", fontFamily: "monospace" }}
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 52, height: 52, backgroundColor: "#dcfce7" }}
                >
                  <span style={{ fontSize: 26 }}>✓</span>
                </div>
                <p
                  className="text-sm font-bold tracking-widest uppercase"
                  style={{ color: "#1a1612" }}
                >
                  {t("mesaDivisionComplete", lang)}
                </p>
                <p
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: "#1a1612" }}
                >
                  {formatPrice(sessionData?.total ?? 0, "EUR", lang)}
                </p>
              </div>
            )}

          </div>

            {/* Trust badge — Redsys + Visa + Mastercard */}
            {sessionData?.pagosHabilitados && !isWaiterMode && (
              <div
                className="flex justify-center items-center py-3"
                style={{ borderTop: "1px dashed #e8e0d8", backgroundColor: "#ffffff" }}
              >
                <Image
                  src="/tpv-redsys-woocommerce.jpg"
                  alt="Pago procesado por Redsys. Aceptamos Visa y Mastercard."
                  width={128}
                  height={40}
                  style={{ opacity: 0.6, objectFit: "contain" }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Division modal */}
      {/* Delete item confirmation modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-6"
          style={{ backgroundColor: "rgba(10, 8, 6, 0.85)" }}
          onClick={() => { if (!deleting) setPendingDelete(null); }}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
            style={{ backgroundColor: "#fffcf7", fontFamily: "monospace" }}
            onClick={e => e.stopPropagation()}
          >
            {pendingDelete.preparadoWarning ? (
              <>
                <p className="text-sm font-bold text-center" style={{ color: "#1a1612" }}>⚠️ Pedido ya preparado</p>
                <p className="text-xs text-center" style={{ color: "#8a7560" }}>
                  Este ítem ya fue marcado como listo en cocina. ¿Quieres eliminarlo igualmente?
                </p>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: "oklch(22% 0.03 252 / 0.12)", color: "#8a7560" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(d => d ? { ...d, preparadoWarning: false } : d)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: "oklch(35% 0.14 25 / 0.9)", color: "oklch(85% 0.08 25)" }}
                  >
                    Continuar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1 text-center">
                  <p className="text-sm font-bold" style={{ color: "#1a1612" }}>
                    Eliminar: {pendingDelete.nombre}
                  </p>
                  {pendingDelete.complementos && pendingDelete.complementos.length > 0 && (
                    <ul className="flex flex-col gap-0.5">
                      {pendingDelete.complementos.map((c, i) => (
                        <li key={i} className="text-xs" style={{ color: "#8a7560" }}>↳ {c.nombre}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setDeleteQty(q => Math.max(1, q - 1))}
                    disabled={deleteQty <= 1}
                    className="w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center disabled:opacity-30"
                    style={{ background: "oklch(22% 0.03 252 / 0.15)", color: "#1a1612" }}
                  >
                    −
                  </button>
                  <span className="text-2xl font-black w-8 text-center tabular-nums" style={{ color: "#1a1612" }}>
                    {deleteQty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeleteQty(q => Math.min(pendingDelete.maxCantidad, q + 1))}
                    disabled={deleteQty >= pendingDelete.maxCantidad}
                    className="w-9 h-9 rounded-full text-lg font-bold flex items-center justify-center disabled:opacity-30"
                    style={{ background: "oklch(22% 0.03 252 / 0.15)", color: "#1a1612" }}
                  >
                    +
                  </button>
                </div>
                <p className="text-xs text-center" style={{ color: "#8a7560" }}>
                  de {pendingDelete.maxCantidad} unidades
                </p>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: "oklch(22% 0.03 252 / 0.12)", color: "#8a7560" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleDeleteItem(); }}
                    disabled={deleting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: "oklch(35% 0.14 25 / 0.9)", color: "oklch(85% 0.08 25)" }}
                  >
                    {deleting ? "…" : "Confirmar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDivisionTypeModal && (
        <DivisionTypeModal
          lang={lang}
          onClose={() => setShowDivisionTypeModal(false)}
          onSelectEqual={() => {
            setShowDivisionTypeModal(false);
            void handlePrePaymentCheck('division-modal');
          }}
          onSelectCustom={() => {
            setShowDivisionTypeModal(false);
            void handleClaimCustomTurn();
          }}
        />
      )}

      {showDivisionModal && sessionData && (
        <DivisionModal
          total={sessionData.total}
          lang={lang}
          onConfirm={(n) => { void handleConfirmDivision(n); }}
          onClose={() => { releaseCheckoutLock(); setShowDivisionModal(false); }}
        />
      )}
    </div>
    </>
  );
}
