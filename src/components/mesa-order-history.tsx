"use client";

import { useEffect, useState, useCallback } from "react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";

interface MesaOrderEntry {
  pedidoId: string;
  trackingToken: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  total: number;
  timestamp: number;
}

interface OrderStatusItem {
  nombre: string;
  cantidad: number;
  precio: number;
}

interface OrderStatus {
  numero_pedido: number;
  estado: string;
  items: OrderStatusItem[];
  total?: number;
}

interface HydratedOrder {
  entry: MesaOrderEntry;
  status: OrderStatus | null;
  loading: boolean;
}

function EstadoChip({ estado, lang }: { estado: string; lang: Parameters<typeof t>[1] }) {
  if (estado === 'servido') {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
        {t('mesaStatusServido', lang)}
      </span>
    );
  }
  if (estado === 'anotado') {
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
        {t('mesaStatusAnotado', lang)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {t('mesaStatusPending', lang)}
    </span>
  );
}

async function fetchOrderStatus(token: string): Promise<OrderStatus | null> {
  try {
    const res = await fetch(`/api/orders/status?token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;
    return await res.json() as OrderStatus;
  } catch {
    return null;
  }
}

export function MesaOrderHistory() {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [orders, setOrders] = useState<HydratedOrder[]>([]);

  // Read mesa param — client-side only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('mesa');
    setMesaId(token);
  }, []);

  // Load from localStorage when mesaId is known
  useEffect(() => {
    if (!mesaId) return;
    try {
      const storageKey = `mesa_orders_${mesaId}`;
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setOrders([]);
        return;
      }
      const entries = JSON.parse(raw) as MesaOrderEntry[];
      setOrders(entries.map(entry => ({ entry, status: null, loading: true })));
    } catch {
      setOrders([]);
    }
  }, [mesaId]);

  // Fetch statuses for all orders
  const refreshStatuses = useCallback(async () => {
    if (orders.length === 0) return;
    const updated = await Promise.all(
      orders.map(async (o) => {
        const status = await fetchOrderStatus(o.entry.trackingToken);
        return { ...o, status, loading: false };
      })
    );
    setOrders(updated);
  }, [orders]);

  // Initial fetch + polling every 10 seconds
  useEffect(() => {
    if (orders.length === 0) return;
    void refreshStatuses();
    const interval = setInterval(() => { void refreshStatuses(); }, 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length, mesaId]);

  // Only render in mesa mode
  if (!mesaId) return null;

  const runningTotal = orders.reduce((sum, o) => sum + o.entry.total, 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-lg max-h-[50vh] overflow-y-auto">
      <div className="container mx-auto max-w-2xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-foreground text-sm">{t('mesaMyOrders', lang)}</p>
          <p className="text-sm font-bold text-foreground">
            {t('mesaRunningTotal', lang)}: {formatPrice(runningTotal, 'EUR', lang)}
          </p>
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">{t('mesaNoOrders', lang)}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {orders.map((o) => {
              const numeroPedido = o.status?.numero_pedido;
              const estado = o.status?.estado ?? 'pendiente';
              const items = o.status?.items ?? o.entry.items.map(i => ({
                nombre: i.name,
                cantidad: i.quantity,
                precio: i.price,
              }));
              return (
                <div
                  key={o.entry.trackingToken}
                  className="rounded-lg border border-border bg-card p-3 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {numeroPedido ? `#${numeroPedido}` : '…'}
                    </span>
                    {o.loading ? (
                      <span className="inline-block w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <EstadoChip estado={estado} lang={lang} />
                    )}
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {items.map((item, i) => (
                      <li key={i} className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.cantidad}× {item.nombre}</span>
                        <span>{formatPrice(item.precio * item.cantidad, 'EUR', lang)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between text-xs font-semibold border-t border-border pt-1">
                    <span className="text-muted-foreground uppercase tracking-wide">
                      {t('total', lang)}
                    </span>
                    <span>{formatPrice(o.entry.total, 'EUR', lang)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
