"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, useCallback } from "react";
import { useLanguage, type Language } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { CheckCircle, ShoppingBag, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  | { mode: "success" }
  | { mode: "no_cupones" }
  | { mode: "token_used" }
  | { mode: "expired" }
  | { mode: "invalid" }
  | { mode: "loading" }
  | null;

const SUPPORTED_LANGS: Language[] = ["es", "en", "fr", "it", "de"];

function resolveLanguage(urlLang: string | null, contextLanguage: Language): Language {
  // 1. Lang from email URL param (highest priority — client received email in this language)
  if (urlLang && SUPPORTED_LANGS.includes(urlLang as Language)) {
    return urlLang as Language;
  }
  // 2. User's saved preference
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("preferred-language");
    if (stored && SUPPORTED_LANGS.includes(stored as Language)) return stored as Language;
  }
  // 3. Browser language
  if (typeof navigator !== "undefined") {
    const lang = (navigator.language || "es").split("-")[0].toLowerCase();
    if (SUPPORTED_LANGS.includes(lang as Language)) return lang as Language;
  }
  return contextLanguage;
}

function TgtgReservaPopupInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language: contextLanguage } = useLanguage();
  const [state, setState] = useState<PopupState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [effectiveLang, setEffectiveLang] = useState<Language>("es");

  // Initialize once from localStorage / browser (runs on mount only)
  useEffect(() => {
    setEffectiveLang(resolveLanguage(null, contextLanguage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the email link provides a lang param, apply it — but do NOT reset when
  // cleanUrl() removes the param (that would flip back to the wrong language mid-toast)
  useEffect(() => {
    const urlLang = searchParams.get("lang");
    if (urlLang && SUPPORTED_LANGS.includes(urlLang as Language)) {
      setEffectiveLang(urlLang as Language);
    }
  }, [searchParams]);

  const cleanUrl = useCallback(() => {
    const url = new URL(globalThis.location.href);
    url.searchParams.delete("tgtg");
    url.searchParams.delete("itemId");
    url.searchParams.delete("promoId");
    url.searchParams.delete("email");
    url.searchParams.delete("token");
    url.searchParams.delete("lang");
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

      fetch(`/api/promo/item/${encodeURIComponent(itemId)}?promoId=${encodeURIComponent(promoId)}&token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("not_found");
          const data = await res.json() as { item: TgtgItemPublic; horaRecogidaInicio: string | null; horaRecogidaFin: string | null; fechaActivacion: string | null; tokenUsed: boolean };

          if (data.tokenUsed) {
            setState({ mode: "token_used" });
            cleanUrl();
            setTimeout(() => setState(null), 7000);
            return;
          }

          // Check expiry client-side using browser local time (= restaurant's timezone)
          if (data.fechaActivacion && data.horaRecogidaFin) {
            const horaFinNorm = data.horaRecogidaFin.length === 5
              ? `${data.horaRecogidaFin}:00`
              : data.horaRecogidaFin;
            // Parsed as LOCAL time by browsers (ES2015+ spec for datetime without timezone)
            const pickupEnd = new Date(`${data.fechaActivacion}T${horaFinNorm}`);
            if (new Date() > pickupEnd) {
              setState({ mode: "expired" });
              cleanUrl();
              setTimeout(() => setState(null), 7000);
              return;
            }
          }

          if (data.item.cuponesDisponibles <= 0) {
            setState({ mode: "no_cupones" });
            cleanUrl();
            setTimeout(() => setState(null), 7000);
            return;
          }

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
        setState({ mode: "success" });
        setTimeout(() => setState(null), 7000);
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

  const handleDismiss = () => {
    cleanUrl();
    setState(null);
  };

  if (!state) return null;

  // Loading spinner
  if (state.mode === "loading") {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-card rounded-2xl shadow-elegant-lg p-8 flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("tgtgLoading", effectiveLang)}</p>
        </div>
      </div>
    );
  }

  // Status toasts
  if (state.mode === "success" || state.mode === "no_cupones" || state.mode === "token_used" || state.mode === "expired" || state.mode === "invalid") {
    const isSuccess = state.mode === "success";
    const msgKey =
      state.mode === "success" ? "tgtgReservedSuccess" :
      state.mode === "no_cupones" ? "tgtgNoStock" :
      state.mode === "token_used" ? "tgtgTokenUsed" :
      state.mode === "expired" ? "tgtgExpired" :
      "tgtgTokenInvalid";

    return (
      <div
        role={isSuccess ? "status" : "alert"}
        aria-live={isSuccess ? "polite" : "assertive"}
        className={`fixed top-20 left-1/2 z-[200] -translate-x-1/2 px-6 py-3 rounded-lg shadow-elegant-lg text-sm font-medium max-w-md text-center ${
          isSuccess ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"
        }`}
      >
        {t(msgKey, effectiveLang)}
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              aria-label={t("tgtgCancelButton", effectiveLang)}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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
            <span className="text-2xl font-bold text-primary">
              €{Number(item.precioDescuento).toFixed(2)}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {item.cuponesDisponibles} {t("tgtgCouponsLeft", effectiveLang)}
            </span>
          </div>

          {/* Pickup time */}
          {horaInicio && horaFin && (
            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 text-sm">
              <span role="img" aria-label={t("pickupTimeIcon", effectiveLang)}>🕐</span>
              <span className="font-medium text-foreground">
                {t("tgtgPickupWindow", effectiveLang)}: {horaInicio} – {horaFin}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={handleDismiss}>
            {t("tgtgCancelButton", effectiveLang)}
          </Button>
          <Button className="flex-1" onClick={handleConfirm} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {t("tgtgConfirmButton", effectiveLang)}
          </Button>
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
