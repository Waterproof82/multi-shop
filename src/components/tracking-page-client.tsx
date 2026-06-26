"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, CheckCircle, AlertCircle, ArrowLeft, Hourglass, ChefHat, Truck } from "lucide-react";
import { getTrackingTokens, removeTrackingToken, isOrderExpired } from "@/lib/order-tracking";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";

interface OrderItem {
  nombre: string;
  translations?: {
    en?: { name: string };
    fr?: { name: string };
    it?: { name: string };
    de?: { name: string };
  };
  cantidad: number;
  precio: number;
}

interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
  items: OrderItem[];
  tipo: string;
  estado: string;
  glovo_status: string | null;
  mesa_numero: number | null;
  mesa_nombre: string | null;
  delivery_fee_cents: number | null;
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

function normalizeStatus(data: OrderStatus): OrderStatus {
  return {
    ...data,
    tipo: data.tipo ?? 'restaurante',
    estado: data.estado ?? 'pendiente',
    glovo_status: data.glovo_status ?? null,
    mesa_numero: data.mesa_numero ?? null,
    mesa_nombre: data.mesa_nombre ?? null,
    delivery_fee_cents: data.delivery_fee_cents ?? null,
    items: (data.items ?? []).map(item => ({
      ...item,
      cantidad: Number(item.cantidad),
      precio: Number(item.precio),
    })),
  };
}

async function fetchOrderStatus(token: string): Promise<{ status: OrderStatus | null; error: boolean }> {
  try {
    const res = await fetch(`/api/orders/status?token=${token}`);
    if (res.status === 404) return { status: null, error: true };
    if (!res.ok) return { status: null, error: false };
    return { status: normalizeStatus(await res.json()), error: false };
  } catch {
    return { status: null, error: false };
  }
}

function sortOrders(orders: OrderState[]): OrderState[] {
  return [...orders].sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    if (!a.status && b.status) return 1;
    if (a.status && !b.status) return -1;
    return (b.status?.numero_pedido ?? 0) - (a.status?.numero_pedido ?? 0);
  });
}

function resolveItemName(item: OrderItem, language: string): string {
  if (language !== 'es') {
    const lang = language as 'en' | 'fr' | 'it' | 'de';
    const translation = item.translations?.[lang];
    if (translation?.name) return translation.name;
  }
  return item.nombre;
}

function ItemsList({ items, language, deliveryFeeCents }: { items: OrderItem[]; language: string; deliveryFeeCents?: number | null }) {
  if (!items || items.length === 0) return null;
  const lang = language as Parameters<typeof t>[1];
  const subtotal = items.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const deliveryFee = deliveryFeeCents ? deliveryFeeCents / 100 : 0;
  const total = subtotal + deliveryFee;
  return (
    <div className="w-full rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {t('trackingOrderedItems', lang)}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-foreground">{item.cantidad}×</span>
              <span className="text-foreground">{resolveItemName(item, language)}</span>
            </span>
            <span className="text-muted-foreground shrink-0">
              {formatPrice(item.precio * item.cantidad, 'EUR', lang)}
            </span>
          </li>
        ))}
        {deliveryFee > 0 && (
          <li className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t('trackingDeliveryFee', lang)}</span>
            <span className="text-muted-foreground shrink-0">
              {formatPrice(deliveryFee, 'EUR', lang)}
            </span>
          </li>
        )}
      </ul>
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('trackingTotal', lang)}</span>
        <span className="text-sm font-bold text-foreground">{formatPrice(total, 'EUR', lang)}</span>
      </div>
    </div>
  );
}

function DeliveryStatusBanner({ glovoStatus, estado, lang }: { glovoStatus: string | null; estado: string; lang: Parameters<typeof t>[1] }) {
  const isDelivered = glovoStatus === 'COMPLETED' || estado === 'entregado';
  const isEnRoute = estado === 'en_camino' && !isDelivered;
  const isAccepted = glovoStatus === 'ACCEPTED' && !isDelivered && !isEnRoute;

  if (!glovoStatus && estado !== 'entregado' && estado !== 'en_camino') return null;

  if (isDelivered) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-300">
        <CheckCircle className="w-5 h-5 shrink-0" />
        <span>{t('deliveryStatusCompleted', lang)}</span>
      </div>
    );
  }

  if (isEnRoute) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 px-4 py-3 text-sm font-medium text-blue-700 dark:text-blue-300">
        <Truck className="w-5 h-5 shrink-0 animate-pulse" />
        <span>{t('deliveryStatusEnRoute', lang)}</span>
      </div>
    );
  }

  if (isAccepted) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">
        <Truck className="w-5 h-5 shrink-0 animate-pulse" />
        <span>{t('deliveryStatusAccepted', lang)}</span>
      </div>
    );
  }

  return null;
}

function OrderCard({ order, language }: { order: OrderState; language: string }) {
  const lang = language as Parameters<typeof t>[1];
  const { status } = order;
  const ready = isReady(status?.estimated_ready_at ?? null);
  const remaining = status?.estimated_ready_at ? getRemainingMinutes(status.estimated_ready_at) : null;

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
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
        <p className="text-sm text-muted-foreground">{t('trackingLoadingShort', lang)}</p>
      </div>
    );
  }

  if (status.tipo === 'tienda') {
    const accepted = status.estado !== 'pendiente';
    const acceptedMsg = status.estado === 'soon'
      ? t('tiendaQuickReplySoon', lang)
      : status.estado === 'call'
        ? t('tiendaQuickReplyCall', lang)
        : t('tiendaTrackingAcceptedMessage', lang);
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {accepted
            ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            : <Hourglass className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          }
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {t('trackingOrderPrefix', lang)} #{status.numero_pedido} — {accepted ? t('tiendaTrackingAcceptedTitle', lang) : t('tiendaTrackingTitle', lang)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {accepted ? acceptedMsg : t('tiendaTrackingMessage', lang)}
            </p>
          </div>
        </div>
        <ItemsList items={status.items} language={language} deliveryFeeCents={status.delivery_fee_cents} />
      </div>
    );
  }

  if (status.tipo === 'mesa') {
    const tableLabel = status.mesa_numero !== null
      ? `${t('mesaLabel', lang)} ${status.mesa_numero}${status.mesa_nombre ? ` — ${status.mesa_nombre}` : ''}`
      : t('mesaLabel', lang);
    const isServido = status.estado === 'servido';
    const isAnotado = status.estado === 'anotado';
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {isServido
            ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            : isAnotado
              ? <Clock className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              : <Hourglass className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          }
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {t('trackingOrderPrefix', lang)} #{status.numero_pedido} — {tableLabel}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isServido
                ? t('mesaStatusServido', lang)
                : isAnotado
                  ? t('mesaStatusAnotado', lang)
                  : t('mesaStatusPending', lang)}
            </p>
          </div>
        </div>
        <ItemsList items={status.items} language={language} deliveryFeeCents={status.delivery_fee_cents} />
      </div>
    );
  }

  if (ready) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {t('trackingOrderPrefix', lang)} #{status.numero_pedido} — {t('trackingReady', lang)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{t('trackingPickup', lang)}</p>
          </div>
        </div>
        <ItemsList items={status.items} language={language} deliveryFeeCents={status.delivery_fee_cents} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 flex flex-col gap-3">
      <DeliveryStatusBanner glovoStatus={status.glovo_status ?? null} estado={status.estado} lang={lang} />
      <div className="flex items-start gap-3">
        <ChefHat className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            {t('trackingOrderPrefix', lang)} #{status.numero_pedido} — {status.estimated_minutes === null ? t('trackingWaiting', lang) : t('trackingPrep', lang)}
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
      <ItemsList items={status.items} language={language} deliveryFeeCents={status.delivery_fee_cents} />
    </div>
  );
}

export function TrackingPageClient({ token, initialStatus }: TrackingPageClientProps) {
  const [orders, setOrders] = useState<OrderState[]>([]);
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const router = useRouter();

  useEffect(() => {
    const allTokens = [token, ...getTrackingTokens().filter((tk: string) => tk !== token)];
    setOrders(allTokens.map((tk, i) => ({
      token: tk,
      status: i === 0 && initialStatus ? normalizeStatus(initialStatus) : null,
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
        if (result.status) {
          if (isOrderExpired(result.status.estimated_ready_at)) {
            removeTrackingToken(o.token);
          }
          return { ...o, status: result.status };
        }
        return o;
      })
    );
    setOrders(updates);
  }, [orders]);

  useEffect(() => {
    if (orders.length === 0) return;
    const allDone = orders.every(
      o => o.error || o.status?.estado === 'entregado' || o.status?.glovo_status === 'COMPLETED'
    );
    if (allDone) return;
    const interval = setInterval(pollAll, 5000);
    return () => clearInterval(interval);
  }, [pollAll, orders]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">{t('trackingLoading', lang)}</p>
      </div>
    );
  }

  const sorted = sortOrders(orders);
  const primaryOrder = sorted[0];
  const otherOrders = sorted.slice(1).filter(o => o.status?.tipo !== 'mesa');
  const primaryReady = isReady(primaryOrder.status?.estimated_ready_at ?? null);
  const primaryRemaining = primaryOrder.status?.estimated_ready_at
    ? getRemainingMinutes(primaryOrder.status.estimated_ready_at)
    : null;

  return (
    <div className="flex flex-col gap-8">
      {/* Volver al inicio */}
      <button
        onClick={() => router.push('/')}
        className="self-start flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 min-h-[44px] -mt-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('trackingBackToHome', lang)}
      </button>

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
        ) : primaryOrder.status.tipo === 'tienda' ? (
          <>
            {primaryOrder.status.estado === 'pendiente' ? (
              <Hourglass className="w-16 h-16 text-primary animate-pulse" style={{ animationDuration: '1.5s' }} />
            ) : (
              <CheckCircle className="w-16 h-16 text-green-500" />
            )}
            <div>
              <p className="text-2xl font-bold text-foreground">
                {primaryOrder.status.estado === 'pendiente'
                  ? t('tiendaTrackingTitle', lang)
                  : t('tiendaTrackingAcceptedTitle', lang)}
              </p>
              <p className="text-muted-foreground mt-1">{t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}</p>
            </div>
            <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm w-full">
              <p className="text-secondary-foreground">
                {primaryOrder.status.estado === 'pendiente'
                  ? t('tiendaTrackingMessage', lang)
                  : primaryOrder.status.estado === 'soon'
                    ? t('tiendaQuickReplySoon', lang)
                    : primaryOrder.status.estado === 'call'
                      ? t('tiendaQuickReplyCall', lang)
                      : t('tiendaTrackingAcceptedMessage', lang)}
              </p>
            </div>
            <ItemsList items={primaryOrder.status.items} language={language} deliveryFeeCents={primaryOrder.status.delivery_fee_cents} />
          </>
        ) : primaryOrder.status.tipo === 'mesa' ? (
          <>
            {primaryOrder.status.estado === 'servido' ? (
              <CheckCircle className="w-16 h-16 text-green-500" />
            ) : primaryOrder.status.estado === 'anotado' ? (
              <Clock className="w-16 h-16 text-blue-500" />
            ) : (
              <Hourglass className="w-16 h-16 text-primary animate-pulse" style={{ animationDuration: '1.5s' }} />
            )}
            <div>
              <p className="text-2xl font-bold text-foreground">
                {primaryOrder.status.estado === 'servido'
                  ? t('mesaStatusServido', lang)
                  : primaryOrder.status.estado === 'anotado'
                    ? t('mesaStatusAnotado', lang)
                    : t('mesaStatusPending', lang)}
              </p>
              <p className="text-muted-foreground mt-1">
                {t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}
                {primaryOrder.status.mesa_numero !== null && (
                  <> — {t('mesaLabel', lang)} {primaryOrder.status.mesa_numero}{primaryOrder.status.mesa_nombre ? ` (${primaryOrder.status.mesa_nombre})` : ''}</>
                )}
              </p>
            </div>
            <ItemsList items={primaryOrder.status.items} language={language} deliveryFeeCents={primaryOrder.status.delivery_fee_cents} />
          </>
        ) : primaryReady ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-foreground">{t('trackingReady', lang)}</p>
              <p className="text-muted-foreground mt-1">{t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}</p>
            </div>
            <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm w-full">
              <p className="text-secondary-foreground">{t('trackingPickup', lang)}</p>
            </div>
            <ItemsList items={primaryOrder.status.items} language={language} deliveryFeeCents={primaryOrder.status.delivery_fee_cents} />
          </>
        ) : (
          <>
            <DeliveryStatusBanner glovoStatus={primaryOrder.status.glovo_status ?? null} estado={primaryOrder.status.estado} lang={lang} />
            <div className="relative inline-flex items-center justify-center w-16 h-16">
              {primaryOrder.status.estimated_minutes === null ? (
                <Hourglass className="w-16 h-16 text-primary animate-pulse" style={{ animationDuration: '1.5s' }} />
              ) : (
                <>
                  <span className="absolute w-16 h-16 rounded-full bg-primary animate-ping" style={{ opacity: 0.2, animationDuration: '2s' }} />
                  <span className="absolute w-20 h-20 rounded-full bg-primary animate-ping" style={{ opacity: 0.1, animationDuration: '2s', animationDelay: '0.7s' }} />
                  <ChefHat className="relative w-16 h-16 text-primary z-10" />
                </>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{primaryOrder.status.estimated_minutes === null ? t('trackingWaiting', lang) : t('trackingPrep', lang)}</p>
              <p className="text-muted-foreground mt-1">{t('trackingOrderPrefix', lang)} #{primaryOrder.status.numero_pedido}</p>
            </div>
            {primaryOrder.status.estimated_minutes === null ? (
              <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm w-full">
                <p className="text-secondary-foreground">{t('trackingReceived', lang)}</p>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary px-6 py-5 max-w-sm w-full space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-primary animate-pulse" />
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
            <ItemsList items={primaryOrder.status.items} language={language} deliveryFeeCents={primaryOrder.status.delivery_fee_cents} />
          </>
        )}
      </div>

      {/* Otros pedidos */}
      {otherOrders.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">{t('trackingOtherOrders', lang)}</p>
          {otherOrders.map(order => (
            <OrderCard key={order.token} order={order} language={language} />
          ))}
        </div>
      )}
    </div>
  );
}
