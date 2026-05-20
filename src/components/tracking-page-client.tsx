"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle, AlertCircle, PartyPopper } from "lucide-react";
import { getTrackingTokens } from "@/lib/order-tracking";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";

interface OrderItem {
  nombre: string;
  cantidad: number;
  precio: number;
}

interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
  items: OrderItem[];
}

interface TrackingPageClientProps {
  token: string;
  initialStatus: OrderStatus | null;
}

interface OrderState {
  token: string;
  status: OrderStatus | null;
  error: boolean;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' h';
}

function isReady(estimated_ready_at: string | null): boolean {
  if (!estimated_ready_at) return false;
  return new Date(estimated_ready_at) <= new Date();
}

function getRemainingMinutes(estimated_ready_at: string): number {
  const remainingMs = new Date(estimated_ready_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 60000));
}

async function fetchOrderStatus(token: string): Promise<{ status: OrderStatus | null; error: boolean }> {
  try {
    const res = await fetch(`/api/orders/status?token=${token}`);
    if (res.status === 404) return { status: null, error: true };
    if (!res.ok) return { status: null, error: false };
    return { status: await res.json(), error: false };
  } catch {
    return { status: null, error: false };
  }
}

function ItemsList({ items, language }: { items: OrderItem[]; language: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {t('trackingOrderedItems', language as Parameters<typeof t>[1])}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{item.cantidad}×</span>
              <span className="text-foreground">{item.nombre}</span>
            </span>
            <span className="text-muted-foreground shrink-0">
              {formatPrice(item.precio * item.cantidad, 'EUR', language as Parameters<typeof t>[1])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderCard({ order, isPrimary, language }: { order: OrderState; isPrimary: boolean; language: string }) {
  const lang = language as Parameters<typeof t>[1];
  const { status } = order;
  const ready = isReady(status?.estimated_ready_at ?? null);

  if (order.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
        <p className="text-sm text-muted-foreground">{t('trackingNotFound', lang)}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${isPrimary ? 'border-border' : 'border-border bg-muted/30'}`}>
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
        <p className="text-sm text-muted-foreground">{t('trackingLoadingShort', lang)}</p>
      </div>
    );
  }

  if (ready) {
    return (
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${isPrimary ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40' : 'border-border bg-muted/30'}`}>
        <PartyPopper className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {t('trackingOrderPrefix', lang)} #{status.numero_pedido} — {t('trackingReady', lang)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('trackingPickup', lang)}</p>
        </div>
      </div>
    );
  }

  const remaining = status.estimated_ready_at ? getRemainingMinutes(status.estimated_ready_at) : null;

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${isPrimary ? 'border-primary/30 bg-background' : 'border-border bg-muted/30'}`}>
      <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">
          {t('trackingOrderPrefix', lang)} #{status.numero_pedido} — {t('trackingPrep', lang)}
        </p>
        {status.estimated_minutes === null ? (
          <p className="text-xs text-muted-foreground mt-0.5">{t('trackingPendingTime', lang)}</p>
        ) : (
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              {remaining !== null && remaining > 0
                ? <>{remaining} min</>
                : <>{t('trackingPickupAt', lang)} <span className="font-medium text-foreground">{formatTime(status.estimated_ready_at!)}</span></>
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function TrackingPageClient({ token, initialStatus }: TrackingPageClientProps) {
  const [orders, setOrders] = useState<OrderState[]>([]);
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];

  useEffect(() => {
    const allTokens = [token, ...getTrackingTokens().filter((tk: string) => tk !== token)];
    setOrders(allTokens.map((tk, i) => ({
      token: tk,
      status: i === 0 ? initialStatus : null,
      error: false,
    })));
  }, [token, initialStatus]);

  const pollAll = useCallback(async () => {
    if (orders.length === 0) return;
    const updates = await Promise.all(
      orders.map(async (o) => {
        if (o.error) return o;
        const result = await fetchOrderStatus(o.token);
        if (result.error) return { ...o, error: true };
        if (result.status) return { ...o, status: result.status };
        return o;
      })
    );
    setOrders(updates);
  }, [orders]);

  useEffect(() => {
    if (orders.length === 0) return;
    const interval = setInterval(pollAll, 5000);
    return () => clearInterval(interval);
  }, [pollAll, orders.length]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">{t('trackingLoading', lang)}</p>
      </div>
    );
  }

  const primaryOrder = orders[0];
  const otherOrders = orders.slice(1);
  const primaryReady = isReady(primaryOrder.status?.estimated_ready_at ?? null);
  const primaryRemaining = primaryOrder.status?.estimated_ready_at
    ? getRemainingMinutes(primaryOrder.status.estimated_ready_at)
    : null;

  return (
    <div className="flex flex-col gap-8">
      {/* Pedido principal — vista grande */}
      <div className="flex flex-col items-center gap-6 text-center">
        {primaryOrder.error ? (
          <>
            <AlertCircle className="w-16 h-16 text-destructive" />
            <p className="text-lg text-muted-foreground">{t('trackingNotFound', lang)}</p>
          </>
        ) : !primaryOrder.status ? (
          <>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">{t('trackingLoading', lang)}</p>
          </>
        ) : primaryReady ? (
          <>
            <PartyPopper className="w-16 h-16 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{t('trackingReady', lang)}</p>
              <p className="text-muted-foreground mt-1">{t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}</p>
            </div>
            <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
              <p className="text-secondary-foreground">{t('trackingPickup', lang)}</p>
            </div>
            <ItemsList items={primaryOrder.status.items} language={language} />
          </>
        ) : (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-foreground">{t('trackingPrep', lang)}</p>
              <p className="text-muted-foreground mt-1">{t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}</p>
            </div>
            {primaryOrder.status.estimated_minutes === null ? (
              <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
                <p className="text-secondary-foreground">{t('trackingReceived', lang)}</p>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary px-6 py-5 max-w-sm space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="text-lg font-semibold text-foreground">
                    {primaryRemaining !== null && primaryRemaining > 0
                      ? <>~{primaryRemaining} min</>
                      : <>{t('trackingReadyAny', lang)}</>
                    }
                  </span>
                </div>
                {primaryOrder.status.estimated_ready_at && (
                  <p className="text-muted-foreground">
                    {t('trackingPickupAt', lang)}{' '}
                    <span className="font-semibold text-foreground">
                      {formatTime(primaryOrder.status.estimated_ready_at)}
                    </span>
                  </p>
                )}
              </div>
            )}
            <ItemsList items={primaryOrder.status.items} language={language} />
          </>
        )}
      </div>

      {/* Otros pedidos activos */}
      {otherOrders.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t('trackingOtherOrders', lang)}</p>
          {otherOrders.map(order => (
            <OrderCard key={order.token} order={order} isPrimary={false} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
