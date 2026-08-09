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

/** Cuánto se queda el aviso en pantalla antes de desaparecer solo. */
const MS_AVISO_VISIBLE = 7000;

/**
 * ¿Se pasó la hora de recogida?
 *
 * La fecha y la hora vienen SIN zona horaria, así que el navegador las
 * interpreta como hora LOCAL — que es justo lo que queremos: la recogida es
 * presencial, y la hora que importa es la del sitio donde está el cliente, no
 * la del servidor.
 */
export function haExpiradoLaRecogida(
  fechaActivacion: string | null,
  horaRecogidaFin: string | null,
  ahora: Date,
): boolean {
  if (!fechaActivacion || !horaRecogidaFin) return false;
  // La hora puede llegar como 'HH:MM' o como 'HH:MM:SS'.
  const horaFin = horaRecogidaFin.length === 5 ? `${horaRecogidaFin}:00` : horaRecogidaFin;
  return ahora > new Date(`${fechaActivacion}T${horaFin}`);
}

/**
 * Por qué NO se puede reservar este ítem, o `null` si sí se puede.
 *
 * Pura a propósito, y con `ahora` inyectado: es la única regla de negocio del
 * popup y así se puede probar sin montar nada ni esperar a que pase el tiempo.
 * Todo lo demás en este fichero es pintar.
 */
export function motivoDeRechazo(
  data: {
    tokenUsed: boolean;
    fechaActivacion: string | null;
    horaRecogidaFin: string | null;
    item: { cuponesDisponibles: number };
  },
  ahora: Date,
): 'token_used' | 'expired' | 'no_cupones' | null {
  if (data.tokenUsed) return 'token_used';
  if (haExpiradoLaRecogida(data.fechaActivacion, data.horaRecogidaFin, ahora)) return 'expired';
  if (data.item.cuponesDisponibles <= 0) return 'no_cupones';
  return null;
}

/** Modos que el popup puede mostrar sin datos extra: un aviso y nada más. */
type ModoAviso = 'success' | 'no_cupones' | 'token_used' | 'expired' | 'invalid';

/**
 * Qué texto lleva cada aviso. Sustituye a una cadena de cinco ternarios
 * anidados: con la tabla, añadir un modo nuevo obliga a dar su mensaje —
 * TypeScript no deja el `Record` incompleto.
 */
const MENSAJE_AVISO: Record<ModoAviso, Parameters<typeof t>[0]> = {
  success: 'tgtgReservedSuccess',
  no_cupones: 'tgtgNoStock',
  token_used: 'tgtgTokenUsed',
  expired: 'tgtgExpired',
  invalid: 'tgtgTokenInvalid',
};

/**
 * El predicado mira el ESTADO, no el modo suelto.
 *
 * Con `(mode: string) => mode is ModoAviso` TypeScript estrecha la cadena pero
 * no el objeto, y al salir del `if` seguiría creyendo que `state` puede ser
 * cualquier variante — perdiendo el acceso a `item`, `horaInicio` y `horaFin`
 * del modo `confirm`. Tipando el predicado sobre el estado, la rama negativa
 * queda correctamente reducida a `confirm`.
 */
type EstadoAviso = Extract<NonNullable<PopupState>, { mode: ModoAviso }>;

function esAviso(estado: NonNullable<PopupState>): estado is EstadoAviso {
  return Object.hasOwn(MENSAJE_AVISO, estado.mode);
}

/**
 * Qué mostrar según lo que respondió la reserva.
 *
 * El `409` y `token_used` son el MISMO caso visto por el cliente: alguien ya usó
 * ese enlace. El servidor los distingue por capa (HTTP frente a cuerpo); a quien
 * mira la pantalla le da igual.
 *
 * Cualquier resultado que no reconozcamos cae en `invalid`, no en `success`:
 * ante la duda, no se le dice a nadie que tiene una reserva que quizá no existe.
 */
export function modoTrasReservar(status: number, resultado: string | undefined): ModoAviso {
  if (status === 409 || resultado === 'token_used') return 'token_used';
  if (resultado === 'no_cupones') return 'no_cupones';
  if (resultado === 'expired') return 'expired';
  if (resultado === 'ok') return 'success';
  return 'invalid';
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

    /** Muestra el aviso, limpia la URL y programa que se oculte solo. */
    const avisar = (nuevo: PopupState) => {
      setState(nuevo);
      cleanUrl();
      return setTimeout(() => setState(null), MS_AVISO_VISIBLE);
    };

    if (tgtgParam === "ok") {
      const timer = avisar({ mode: "success" });
      return () => clearTimeout(timer);
    }

    if (tgtgParam === "lleno") {
      const timer = avisar({ mode: "no_cupones" });
      return () => clearTimeout(timer);
    }

    if (tgtgParam !== "confirm") return;

    const itemId = searchParams.get("itemId");
    const promoId = searchParams.get("promoId");
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!itemId || !promoId || !email || !token) {
      const timer = avisar({ mode: "invalid" });
      return () => clearTimeout(timer);
    }

    setState({ mode: "loading" });

    fetch(`/api/promo/item/${encodeURIComponent(itemId)}?promoId=${encodeURIComponent(promoId)}&token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not_found");
        const data = await res.json() as { item: TgtgItemPublic; horaRecogidaInicio: string | null; horaRecogidaFin: string | null; fechaActivacion: string | null; tokenUsed: boolean };

        const rechazo = motivoDeRechazo(data, new Date());
        if (rechazo) {
          avisar({ mode: rechazo });
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
        avisar({ mode: "invalid" });
      });
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
      setState({ mode: modoTrasReservar(res.status, data.result) });
      setTimeout(() => setState(null), MS_AVISO_VISIBLE);
    } catch {
      setState({ mode: "invalid" });
      cleanUrl();
      setTimeout(() => setState(null), MS_AVISO_VISIBLE);
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
  if (esAviso(state)) {
    const isSuccess = state.mode === "success";
    const msgKey = MENSAJE_AVISO[state.mode];

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
            <button type="button"
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
