"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChefHat, ShoppingBag, X } from "lucide-react";
import { getTrackingTokens, removeTrackingToken, isOrderExpired } from "@/lib/order-tracking";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface OrderEntry {
  token: string;
  tipo: string;
}

export function ActiveOrderBanner() {
  const [orders, setOrders] = useState<OrderEntry[]>([]);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const router = useRouter();
  const { language } = useLanguage();

  const checkTokens = useCallback(async () => {
    const stored = getTrackingTokens();
    if (stored.length === 0) { setOrders([]); return; }

    const results = await Promise.all(
      stored.map(async (token): Promise<OrderEntry | null> => {
        try {
          const res = await fetch(`/api/orders/status?token=${token}`);
          if (res.status === 404) { removeTrackingToken(token); return null; }
          if (!res.ok) return { token, tipo: 'restaurante' };
          const data = await res.json();
          const tipo: string = data.tipo ?? 'restaurante';
          if (tipo === 'mesa') return null;
          if (tipo === 'restaurante' && isOrderExpired(data.estimated_ready_at)) {
            removeTrackingToken(token);
            return null;
          }
          return { token, tipo };
        } catch {
          return { token, tipo: 'restaurante' };
        }
      })
    );

    setOrders(results.filter((r): r is OrderEntry => r !== null));
  }, []);

  useEffect(() => {
    checkTokens();
    window.addEventListener('tracking-token-added', checkTokens);
    return () => window.removeEventListener('tracking-token-added', checkTokens);
  }, [checkTokens]);

  const handleDismissTienda = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDismissConfirm(true);
  }, []);

  const handleConfirmDismiss = useCallback(() => {
    const tiendaOrder = orders.find(o => o.tipo === 'tienda');
    if (tiendaOrder) {
      removeTrackingToken(tiendaOrder.token);
      setOrders(prev => prev.filter(o => o.token !== tiendaOrder.token));
    }
    setShowDismissConfirm(false);
  }, [orders]);

  if (orders.length === 0) return null;

  const hasTienda = orders.some(o => o.tipo === 'tienda');
  const primaryToken = orders[0].token;

  const bannerText = hasTienda
    ? t('tiendaBannerText', language)
    : orders.length === 1
      ? t('bannerSingular', language)
      : t('bannerPlural', language).replace('{count}', String(orders.length));

  const bannerCta = hasTienda
    ? t('tiendaBannerCta', language)
    : t('bannerCta', language);

  const Icon = hasTienda ? ShoppingBag : ChefHat;

  return (
    <>
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm">
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3.5 cursor-pointer active:scale-[0.97] transition-all duration-200 border border-white/15"
          style={{
            background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
            color: '#fff',
            boxShadow: '0 8px 24px rgba(249, 115, 22, 0.45), 0 2px 8px rgba(0,0,0,0.12)',
          }}
          onClick={() => router.push(`/tracking/${primaryToken}`)}
          role="button"
          aria-label={bannerCta}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 shrink-0 backdrop-blur-sm">
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight tracking-wide">{bannerText}</p>
            <p className="text-xs mt-0.5 font-medium" style={{ opacity: 0.82 }}>{bannerCta} →</p>
          </div>
          {hasTienda && (
            <button
              type="button"
              onClick={handleDismissTienda}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/35 transition-colors shrink-0"
              aria-label={t('close', language)}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={showDismissConfirm} onOpenChange={setShowDismissConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t('tiendaDismissConfirmTitle', language)}</DialogTitle>
            <DialogDescription>{t('tiendaDismissConfirmMessage', language)}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowDismissConfirm(false)}
              className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t('cancel', language)}
            </button>
            <button
              type="button"
              onClick={handleConfirmDismiss}
              className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              {t('tiendaDismissConfirmAccept', language)}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
