"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle, AlertCircle, PartyPopper } from "lucide-react";
import { getTrackingTokens } from "@/lib/order-tracking";

interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
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

function OrderCard({ order, isPrimary }: { order: OrderState; isPrimary: boolean }) {
  const { status } = order;
  const ready = isReady(status?.estimated_ready_at ?? null);

  if (order.error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
        <p className="text-sm text-muted-foreground">Pedido no encontrado.</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={`rounded-xl border p-4 flex items-center gap-3 ${isPrimary ? 'border-border' : 'border-border bg-muted/30'}`}>
        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
        <p className="text-sm text-muted-foreground">Cargando estado...</p>
      </div>
    );
  }

  if (ready) {
    return (
      <div className={`rounded-xl border p-4 flex items-start gap-3 ${isPrimary ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40' : 'border-border bg-muted/30'}`}>
        <PartyPopper className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">¡Pedido #{status.numero_pedido} listo!</p>
          <p className="text-xs text-muted-foreground mt-0.5">Ya podés pasar a recogerlo.</p>
        </div>
      </div>
    );
  }

  const remaining = status.estimated_ready_at ? getRemainingMinutes(status.estimated_ready_at) : null;

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${isPrimary ? 'border-primary/30 bg-background' : 'border-border bg-muted/30'}`}>
      <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">Pedido #{status.numero_pedido} — en preparación</p>
        {status.estimated_minutes === null ? (
          <p className="text-xs text-muted-foreground mt-0.5">Tiempo de recogida pendiente de confirmar.</p>
        ) : (
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              {remaining !== null && remaining > 0
                ? <>Listo en unos <span className="font-medium text-foreground">{remaining} min</span></>
                : <>Listo aproximadamente a las <span className="font-medium text-foreground">{formatTime(status.estimated_ready_at!)}</span></>
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

  useEffect(() => {
    const allTokens = [token, ...getTrackingTokens().filter(t => t !== token)];
    setOrders(allTokens.map((t, i) => ({
      token: t,
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
        <p className="text-muted-foreground">Cargando estado del pedido...</p>
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
            <p className="text-lg text-muted-foreground">Pedido no encontrado.</p>
          </>
        ) : !primaryOrder.status ? (
          <>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">Cargando estado del pedido...</p>
          </>
        ) : primaryReady ? (
          <>
            <PartyPopper className="w-16 h-16 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">¡Tu pedido está listo!</p>
              <p className="text-muted-foreground mt-1">Pedido #{primaryOrder.status.numero_pedido}</p>
            </div>
            <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
              <p className="text-secondary-foreground">Ya podés pasar a recogerlo.</p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle className="w-16 h-16 text-green-500" />
            <div>
              <p className="text-2xl font-bold text-foreground">Tu pedido está en preparación</p>
              <p className="text-muted-foreground mt-1">Pedido #{primaryOrder.status.numero_pedido}</p>
            </div>
            {primaryOrder.status.estimated_minutes === null ? (
              <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
                <p className="text-secondary-foreground">
                  Tu pedido ha sido recibido. En breve recibirás el tiempo de recogida.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-secondary px-6 py-5 max-w-sm space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="text-lg font-semibold text-foreground">
                    {primaryRemaining !== null && primaryRemaining > 0
                      ? <>Listo en unos {primaryRemaining} min</>
                      : <>Listo en cualquier momento</>
                    }
                  </span>
                </div>
                {primaryOrder.status.estimated_ready_at && (
                  <p className="text-muted-foreground">
                    Recogida aproximada a las{' '}
                    <span className="font-semibold text-foreground">
                      {formatTime(primaryOrder.status.estimated_ready_at)}
                    </span>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Otros pedidos activos */}
      {otherOrders.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Otros pedidos en curso</p>
          {otherOrders.map(order => (
            <OrderCard key={order.token} order={order} isPrimary={false} />
          ))}
        </div>
      )}
    </div>
  );
}
