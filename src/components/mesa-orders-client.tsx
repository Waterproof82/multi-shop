"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";

interface OrderItem {
  nombre: string;
  cantidad: number;
  precio: number;
  complementos?: { nombre: string; precio: number }[];
  translations?: Record<string, { name?: string } | undefined>;
}

interface MesaOrder {
  id: string;
  items: OrderItem[];
  createdAt: string;
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
}

interface MesaInfo {
  numero: number;
  nombre: string | null;
}

type PendingAction = 'full' | 'division-modal' | 'division-pay';

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

// Personas selector modal
function DivisionModal({
  total,
  lang,
  onConfirm,
  onClose,
}: {
  total: number;
  lang: Parameters<typeof t>[1];
  onConfirm: (n: number) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(2);
  const perPersona = Math.round((total / selected) * 100) / 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 pb-10"
        style={{ backgroundColor: "#fffcf7", fontFamily: "monospace" }}
        onClick={(e) => e.stopPropagation()}
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

export function MesaOrdersClient({ mesaId }: { mesaId: string }) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [sessionData, setSessionData] = useState<MesaSessionData | null>(null);
  const [mesaInfo, setMesaInfo] = useState<MesaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [showDivisionModal, setShowDivisionModal] = useState(false);
  const [settingDivision, setSettingDivision] = useState(false);
  const [cancellingDivision, setCancellingDivision] = useState(false);
  const [verifyingTotal, setVerifyingTotal] = useState(false);
  const [totalMismatch, setTotalMismatch] = useState<{
    oldTotal: number;
    newTotal: number;
    pendingAction: PendingAction;
  } | null>(null);

  // Derived early so the polling effect can use it as a dependency
  const pagoEnCursoForPoll = sessionData?.pagoEnCurso ?? false;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (res.ok) setSessionData(await res.json() as MesaSessionData);
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [mesaId]);

  useEffect(() => {
    void refresh();
    // Poll every 3s while a payment is in progress — so the overlay
    // disappears within seconds of the payment completing or being cancelled.
    // Otherwise poll every 10s to reduce server load.
    const interval = setInterval(() => { void refresh(); }, pagoEnCursoForPoll ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [refresh, pagoEnCursoForPoll]);

  useEffect(() => {
    fetch(`/api/mesas?token=${encodeURIComponent(mesaId)}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { numero: number; nombre: string | null } | null) => {
        if (d) setMesaInfo({ numero: d.numero, nombre: d.nombre });
      })
      .catch(() => null);
  }, [mesaId]);

  const initiateRedsys = async (esDivision: boolean) => {
    if (paying) return;
    setPaying(true);
    try {
      const res = await fetch('/api/redsys/initiate-mesa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mesaId, esDivision }),
      });
      if (res.status === 423) {
        // Another payment started between verification and now — refresh to show overlay
        setPaying(false);
        void refresh();
        return;
      }
      if (!res.ok) { setPaying(false); return; }
      const formData = await res.json() as {
        DS_MERCHANT_PARAMETERS: string;
        DS_SIGNATURE: string;
        DS_SIGNATURE_VERSION: string;
      };
      const redsysUrl = process.env.NEXT_PUBLIC_REDSYS_URL ?? 'https://sis-t.redsys.es:25443/sis/realizarPago';
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
          setTotalMismatch({ oldTotal: currentTotal, newTotal: fresh.total, pendingAction: 'division-modal' });
          return;
        }
        setSessionData(fresh);
      }
      await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/division`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numPersonas }),
      });
      await refresh();
    } finally {
      setSettingDivision(false);
    }
  };

  const executePendingAction = (action: PendingAction) => {
    setTotalMismatch(null);
    if (action === 'full') {
      void initiateRedsys(false);
    } else if (action === 'division-modal') {
      setShowDivisionModal(true);
    } else {
      void initiateRedsys(true);
    }
  };

  const handlePrePaymentCheck = async (action: PendingAction) => {
    if (paying || verifyingTotal) return;
    setVerifyingTotal(true);
    try {
      // Verify total against fresh DB state before going to Redsys
      const res = await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/orders`);
      if (!res.ok) { executePendingAction(action); return; }
      const fresh = await res.json() as MesaSessionData;
      if (fresh.pagoEnCurso) {
        // Another user started paying while we were checking — update state so overlay appears
        setSessionData(fresh);
        return;
      }
      const currentTotal = sessionData?.total ?? 0;
      if (Math.abs(fresh.total - currentTotal) > 0.005) {
        setSessionData(fresh);
        setTotalMismatch({ oldTotal: currentTotal, newTotal: fresh.total, pendingAction: action });
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

  // Another user is paying — we should wait without being able to navigate away
  const externalPaymentInProgress = (sessionData?.pagoEnCurso ?? false) && !paying;

  // Trap the browser back button while someone else's payment is in progress
  useEffect(() => {
    if (!externalPaymentInProgress) return;
    window.history.pushState({ mesaPaymentWaiting: true }, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState({ mesaPaymentWaiting: true }, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [externalPaymentInProgress]);

  const allItems = sessionData?.orders.flatMap((o) => o.items) ?? [];

  const firstOrderDate = sessionData?.orders[0]?.createdAt
    ? new Date(sessionData.orders[0].createdAt)
    : null;
  const dateStr = firstOrderDate?.toLocaleDateString(language, { day: "2-digit", month: "2-digit", year: "numeric" }) ?? "";
  const timeStr = firstOrderDate?.toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit", hour12: false }) ?? "";
  const tableLabel = mesaInfo?.nombre ?? (mesaInfo ? `Mesa ${mesaInfo.numero}` : "Mesa");

  const division = sessionData?.division ?? null;
  const fullyPaid = (sessionData?.sesionPagada ?? false) || (division
    ? division.pagosRealizados >= division.personas
    : false);

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: PAGE_BG }}>
      <div className="mx-auto max-w-xs">

        {/* Back link — hidden when session is fully paid or payment is in progress */}
        {!fullyPaid && !externalPaymentInProgress && (
          <div className="mb-5">
            <Link
              href={`/?mesa=${mesaId}`}
              className="text-sm font-medium transition-colors"
              style={{ color: "#8a7560" }}
            >
              {t("mesaBackToMenu", lang)}
            </Link>
          </div>
        )}

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

              {/* Items */}
              <ul className="flex flex-col gap-1 pb-4">
                {allItems.map((item, i) => {
                  const complementoTotal = item.complementos?.reduce((s, c) => s + c.precio, 0) ?? 0;
                  const lineTotal = (item.precio + complementoTotal) * item.cantidad;
                  return (
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
        {allItems.length > 0 && sessionData?.pagosHabilitados && (
          <div className="mt-6 flex flex-col gap-3">

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
                  {Array.from({ length: division.personas }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-full transition-colors duration-300"
                      style={{
                        width: 10,
                        height: 10,
                        backgroundColor: i < division.pagosRealizados ? "#1a1612" : "#e8e0d8",
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
                <span style={{ fontSize: 24, flexShrink: 0 }}>💳</span>
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
            {totalMismatch && !externalPaymentInProgress && (
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
                    onClick={() => executePendingAction(totalMismatch.pendingAction)}
                    className="flex-1 py-3 rounded-xl text-xs font-bold tracking-widest uppercase"
                    style={{ backgroundColor: "#1a1612", color: "#fffcf7" }}
                  >
                    {t("mesaTotalUpdatedConfirm", lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTotalMismatch(null);
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
            {!division && !fullyPaid && !totalMismatch && !externalPaymentInProgress && (
              <div className="flex gap-3">
                {/* Pagar total */}
                <button
                  type="button"
                  onClick={() => { void handlePrePaymentCheck('full'); }}
                  disabled={paying || settingDivision || verifyingTotal}
                  className="flex-1 py-4 rounded-2xl text-sm font-bold tracking-widest uppercase transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: "#1a1612", color: "#fffcf7", fontFamily: "monospace" }}
                >
                  {paying || verifyingTotal ? t("loading", lang) : t("mesaPayTotal", lang)}
                </button>

                {/* Dividir cuenta */}
                <button
                  type="button"
                  onClick={() => { void handlePrePaymentCheck('division-modal'); }}
                  disabled={paying || settingDivision || verifyingTotal}
                  className="flex-1 py-4 rounded-2xl text-sm font-bold tracking-widest uppercase transition-opacity disabled:opacity-50"
                  style={{
                    backgroundColor: "transparent",
                    color: "#1a1612",
                    fontFamily: "monospace",
                    border: "2px solid #1a1612",
                  }}
                >
                  {settingDivision || verifyingTotal ? t("loading", lang) : t("mesaDivideCheck", lang)}
                </button>
              </div>
            )}

            {/* Pagar mi parte */}
            {division && !fullyPaid && !totalMismatch && !externalPaymentInProgress && (
              <button
                type="button"
                onClick={() => { void handlePrePaymentCheck('division-pay'); }}
                disabled={paying || verifyingTotal}
                className="w-full py-4 rounded-2xl text-sm font-bold tracking-widest uppercase transition-opacity disabled:opacity-50"
                style={{ backgroundColor: "#1a1612", color: "#fffcf7", fontFamily: "monospace" }}
              >
                {paying || verifyingTotal
                  ? t("loading", lang)
                  : `${t("mesaPayShare", lang)} ${formatPrice(division.importePorPersona, "EUR", lang)}`}
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
                  {formatPrice(sessionData.total, "EUR", lang)}
                </p>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Division modal */}
      {showDivisionModal && sessionData && (
        <DivisionModal
          total={sessionData.total}
          lang={lang}
          onConfirm={(n) => { void handleConfirmDivision(n); }}
          onClose={() => setShowDivisionModal(false)}
        />
      )}
    </div>
  );
}
