"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { CheckCircle, XCircle, ShoppingBag, X, Loader2 } from "lucide-react";

interface TgtgItemPublic {
  id: string;
  titulo: string;
  descripcion: string | null;
  imagenUrl: string | null;
  precioOriginal: number;
  precioDescuento: number;
  cuponesDisponibles: number;
  tgtgPromoId: string;
}

type PopupState =
  | { mode: "confirm"; item: TgtgItemPublic; horaInicio: string | null; horaFin: string | null; email: string; token: string }
  | { mode: "success"; item?: TgtgItemPublic; horaInicio?: string | null; horaFin?: string | null; email?: string }
  | { mode: "no_cupones" }
  | { mode: "token_used" }
  | { mode: "expired" }
  | { mode: "invalid" }
  | { mode: "loading" }
  | { mode: "loading_token"; item: TgtgItemPublic; horaInicio: string | null; horaFin: string | null; email: string }
  | null;

function TgtgReservaPopupInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language } = useLanguage();
  const [state, setState] = useState<PopupState>(null);
  const [submitting, setSubmitting] = useState(false);

  const cleanUrl = useCallback(() => {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete("tgtg");
    url.searchParams.delete("itemId");
    url.searchParams.delete("promoId");
    url.searchParams.delete("email");
    url.searchParams.delete("token");
    router.replace(url.pathname + (url.search !== "?" ? url.search : ""), { scroll: false });
  }, [router]);

  useEffect(() => {
    const tgtgParam = searchParams.get("tgtg");
    if (!tgtgParam) return;

    if (tgtgParam === "ok") {
      setState({ mode: "success" });
      cleanUrl();
      const timer = setTimeout(() => setState(null), 7000);
      return () => clearTimeout(timer);
    }

    if (tgtgParam === "lleno") {
      setState({ mode: "no_cupones" });
      cleanUrl();
      const timer = setTimeout(() => setState(null), 7000);
      return () => clearTimeout(timer);
    }

    if (tgtgParam === "confirm") {
      const itemId = searchParams.get("itemId");
      const promoId = searchParams.get("promoId");
      const email = searchParams.get("email");
      const token = searchParams.get("token");

      if (!itemId || !promoId || !email || !token) {
        setState({ mode: "invalid" });
        cleanUrl();
        const timer = setTimeout(() => setState(null), 7000);
        return () => clearTimeout(timer);
      }

      setState({ mode: "loading" });

      fetch(`/api/promo/item/${encodeURIComponent(itemId)}?promoId=${encodeURIComponent(promoId)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("not_found");
          const data = await res.json() as { item: TgtgItemPublic; horaRecogidaInicio: string | null; horaRecogidaFin: string | null };
          setState({
            mode: "confirm",
            item: data.item,
            horaInicio: data.horaRecogidaInicio,
            horaFin: data.horaRecogidaFin,
            email,
            token,
          });
        })
        .catch(() => {
          setState({ mode: "invalid" });
          cleanUrl();
          setTimeout(() => setState(null), 7000);
        });
    }
  }, [searchParams, cleanUrl]);

  const handleConfirm = async () => {
    if (!state || state.mode !== "confirm") return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/promo/reservar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: state.item.id,
          tgtgPromoId: state.item.tgtgPromoId,
          email: state.email,
          token: state.token,
        }),
      });

      const data = await res.json() as { result?: string; error?: string };

      cleanUrl();

      if (res.status === 409 || data.result === "token_used") {
        setState({ mode: "token_used" });
        setTimeout(() => setState(null), 7000);
      } else if (data.result === "no_cupones") {
        setState({ mode: "no_cupones" });
        setTimeout(() => setState(null), 7000);
      } else if (data.result === "expired") {
        setState({ mode: "expired" });
        setTimeout(() => setState(null), 7000);
      } else if (data.result === "ok") {
        // Keep success mode with item info so user can claim another if available
        setState({ mode: "success", item: state.item, horaInicio: state.horaInicio, horaFin: state.horaFin, email: state.email });
        setTimeout(() => setState(null), 10000);
      } else {
        setState({ mode: "invalid" });
        setTimeout(() => setState(null), 7000);
      }
    } catch {
      setState({ mode: "invalid" });
      cleanUrl();
      setTimeout(() => setState(null), 7000);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimAnother = async () => {
    if (!state || state.mode !== "success") return;
    const { item, horaInicio = null, horaFin = null, email } = state;
    if (!item || !email) return;
    setState({ mode: "loading_token", item, horaInicio, horaFin, email });
    try {
      const res = await fetch(
        `/api/promo/item/${encodeURIComponent(item.id)}/new-token?promoId=${encodeURIComponent(item.tgtgPromoId)}&email=${encodeURIComponent(email)}`
      );
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setState({ mode: "no_cupones" });
        setTimeout(() => setState(null), 7000);
        return;
      }
      // Re-fetch item to get updated cuponesDisponibles
      const itemRes = await fetch(`/api/promo/item/${encodeURIComponent(item.id)}?promoId=${encodeURIComponent(item.tgtgPromoId)}`);
      const itemData = await itemRes.json() as { item: TgtgItemPublic; horaRecogidaInicio: string | null; horaRecogidaFin: string | null };
      setState({
        mode: "confirm",
        item: itemRes.ok ? itemData.item : item,
        horaInicio,
        horaFin,
        email,
        token: data.token,
      });
    } catch {
      setState({ mode: "invalid" });
      setTimeout(() => setState(null), 7000);
    }
  };

  const handleDismiss = () => {
    cleanUrl();
    setState(null);
  };

  if (!state) return null;

  // Loading spinners
  if (state.mode === "loading" || state.mode === "loading_token") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-card rounded-2xl shadow-elegant-lg p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("tgtgLoading", language)}</p>
        </div>
      </div>
    );
  }

  // Success with "claim another" option
  if (state.mode === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-20 left-1/2 z-[200] -translate-x-1/2 flex flex-col items-center gap-2 max-w-sm w-full px-4"
      >
        <div className="bg-primary text-primary-foreground px-6 py-3 rounded-lg shadow-elegant-lg text-sm font-medium text-center w-full">
          {t("tgtgReservedSuccess", language)}
        </div>
        {state.item && state.email && state.item.cuponesDisponibles > 1 && (
          <button
            onClick={handleClaimAnother}
            className="bg-card border border-border text-foreground px-6 py-2 rounded-lg shadow-elegant-lg text-sm font-medium hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px]"
          >
            {t("tgtgClaimAnother", language)}
          </button>
        )}
      </div>
    );
  }

  // Simple error toasts
  if (state.mode === "no_cupones" || state.mode === "token_used" || state.mode === "expired" || state.mode === "invalid") {
    const msgKey =
      state.mode === "no_cupones" ? "tgtgNoStock" :
      state.mode === "token_used" ? "tgtgTokenUsed" :
      state.mode === "expired" ? "tgtgExpired" :
      "tgtgTokenInvalid";

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed top-20 left-1/2 z-[200] -translate-x-1/2 px-6 py-3 rounded-lg shadow-elegant-lg text-sm font-medium max-w-md text-center bg-destructive text-destructive-foreground"
      >
        {t(msgKey, language)}
      </div>
    );
  }

  // Confirm modal
  const { item, horaInicio, horaFin } = state;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tgtg-dialog-title"
    >
      <div className="bg-card w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-elegant-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground text-sm">TooGoodToGo</span>
          </div>
          <button
            onClick={handleDismiss}
            aria-label={t("tgtgCancelButton", language)}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image */}
        {item.imagenUrl && (
          <div className="relative h-40 bg-muted overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imagenUrl}
              alt={item.titulo}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          <h2 id="tgtg-dialog-title" className="text-lg font-bold text-foreground">
            {item.titulo}
          </h2>
          {item.descripcion && (
            <p className="text-sm text-muted-foreground leading-relaxed">{item.descripcion}</p>
          )}

          {/* Prices */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground line-through">
              €{Number(item.precioOriginal).toFixed(2)}
            </span>
            <span className="text-2xl font-bold text-green-600">
              €{Number(item.precioDescuento).toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {item.cuponesDisponibles} {t("tgtgCouponsLeft", language)}
            </span>
          </div>

          {/* Pickup time */}
          {horaInicio && horaFin && (
            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
              <span>🕐</span>
              <span className="font-medium text-foreground">
                {t("tgtgPickupWindow", language)}: {horaInicio} – {horaFin}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 min-h-[44px] rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            {t("tgtgCancelButton", language)}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="flex-1 min-h-[44px] rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {t("tgtgConfirmButton", language)}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TgtgReservaPopup() {
  return (
    <Suspense fallback={null}>
      <TgtgReservaPopupInner />
    </Suspense>
  );
}
