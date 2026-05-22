"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { formatPrice } from "@/lib/format-price";
import type { Product } from "@/core/domain/entities/types";

interface OrderItem {
  nombre: string;
  cantidad: number;
  precio: number;
}

interface MesaOrder {
  id: string;
  numeroPedido: number;
  items: OrderItem[];
  total: number;
  estado: string;
  createdAt: string;
}

interface MesaSessionData {
  orders: MesaOrder[];
  sesionId: string | null;
  total: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface WaiterTableDetailProps {
  mesaId: string;
}

async function fetchSessionData(mesaId: string): Promise<MesaSessionData | null> {
  try {
    const res = await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/orders`);
    if (!res.ok) return null;
    return await res.json() as MesaSessionData;
  } catch {
    return null;
  }
}

async function fetchProductos(): Promise<Product[]> {
  try {
    const res = await fetch("/api/waiter/productos");
    if (!res.ok) return [];
    const data = await res.json() as { productos: Product[] };
    return data.productos ?? [];
  } catch {
    return [];
  }
}

export function WaiterTableDetail({ mesaId }: WaiterTableDetailProps) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const router = useRouter();

  const [sessionData, setSessionData] = useState<MesaSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Product selector state
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [productos, setProductos] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productosLoading, setProductosLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchSessionData(mesaId);
    setSessionData(data);
    setLoading(false);
  }, [mesaId]);

  // Initial fetch + polling every 10s
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleOpenTable() {
    setActionLoading(true);
    try {
      await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/open`, { method: "POST" });
      await refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseTable() {
    setActionLoading(true);
    try {
      await fetch(`/api/waiter/mesas/${encodeURIComponent(mesaId)}/close`, { method: "POST" });
      router.push("/waiter/tables");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleOpenProductSelector() {
    setShowProductSelector(true);
    if (productos.length === 0) {
      setProductosLoading(true);
      const data = await fetchProductos();
      setProductos(data.filter(p => p.activo));
      setProductosLoading(false);
    }
  }

  function adjustQuantity(product: Product, delta: number) {
    setCart(prev => {
      const existing = prev.find(ci => ci.product.id === product.id);
      if (!existing) {
        if (delta <= 0) return prev;
        return [...prev, { product, quantity: 1 }];
      }
      const newQty = existing.quantity + delta;
      if (newQty <= 0) return prev.filter(ci => ci.product.id !== product.id);
      return prev.map(ci => ci.product.id === product.id ? { ...ci, quantity: newQty } : ci);
    });
  }

  async function handleConfirmOrder() {
    if (cart.length === 0) return;
    setOrderLoading(true);
    try {
      const items = cart.map(ci => ({
        item: {
          id: ci.product.id,
          name: ci.product.titulo_es,
          price: ci.product.precio,
        },
        quantity: ci.quantity,
      }));

      await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "mesa", mesa_id: mesaId, items }),
      });

      setCart([]);
      setShowProductSelector(false);
      await refresh();
    } finally {
      setOrderLoading(false);
    }
  }

  const isOpen = !!(sessionData?.sesionId);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const cartTotal = cart.reduce((sum, ci) => sum + ci.product.precio * ci.quantity, 0);

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/waiter/tables")}
        className="self-start flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
        aria-label="Volver a las mesas"
      >
        ← {t("waiterTablesTitle", lang)}
      </button>

      {/* Actions */}
      <div className="flex gap-3">
        {!isOpen ? (
          <button
            onClick={handleOpenTable}
            disabled={actionLoading}
            className="min-h-[44px] flex-1 rounded-lg bg-green-500 text-white font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
          >
            {t("waiterTableOpenAction", lang)}
          </button>
        ) : (
          <>
            <button
              onClick={handleOpenProductSelector}
              className="min-h-[44px] flex-1 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold text-sm transition-opacity hover:opacity-90"
            >
              {t("waiterAddOrder", lang)}
            </button>
            <button
              onClick={handleCloseTable}
              disabled={actionLoading}
              className="min-h-[44px] flex-1 rounded-lg border border-destructive text-destructive font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-80"
            >
              {t("waiterTableCloseAction", lang)}
            </button>
          </>
        )}
      </div>

      {/* Running total */}
      {isOpen && sessionData && sessionData.total > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="font-semibold text-foreground">{t("waiterTotal", lang)}</span>
          <span className="text-lg font-bold text-foreground">
            {formatPrice(sessionData.total, "EUR", lang)}
          </span>
        </div>
      )}

      {/* Orders list */}
      {isOpen && (
        <div className="flex flex-col gap-3">
          {!sessionData || sessionData.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("waiterNoOrders", lang)}
            </p>
          ) : (
            sessionData.orders.map(order => (
              <div
                key={order.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">#{order.numeroPedido}</span>
                  <span className="text-xs text-muted-foreground">{order.estado}</span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {order.items.map((item, i) => (
                    <li key={i} className="flex justify-between text-sm text-muted-foreground">
                      <span>{item.cantidad}× {item.nombre}</span>
                      <span>{formatPrice(item.precio * item.cantidad, "EUR", lang)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between text-sm font-semibold border-t border-border pt-2">
                  <span className="text-muted-foreground uppercase tracking-wide text-xs">
                    {t("total", lang)}
                  </span>
                  <span>{formatPrice(order.total, "EUR", lang)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Product selector overlay */}
      {showProductSelector && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-foreground">{t("waiterAddOrder", lang)}</h2>
              <button
                onClick={() => { setShowProductSelector(false); setCart([]); }}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {productosLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : productos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("waiterNoOrders", lang)}
                </p>
              ) : (
                productos.map(product => {
                  const cartItem = cart.find(ci => ci.product.id === product.id);
                  const qty = cartItem?.quantity ?? 0;
                  return (
                    <div
                      key={product.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {product.titulo_es}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(product.precio, "EUR", lang)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => adjustQuantity(product, -1)}
                          disabled={qty === 0}
                          aria-label={t("reduceQuantity", lang)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border text-foreground disabled:opacity-30 hover:bg-muted transition-colors"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-foreground">
                          {qty}
                        </span>
                        <button
                          onClick={() => adjustQuantity(product, 1)}
                          aria-label={t("increaseQuantity", lang)}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-border flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("waiterTotal", lang)}</span>
                  <span className="font-bold text-foreground">
                    {formatPrice(cartTotal, "EUR", lang)}
                  </span>
                </div>
                <button
                  onClick={handleConfirmOrder}
                  disabled={orderLoading}
                  className="min-h-[44px] w-full rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
                >
                  {orderLoading ? t("loading", lang) : t("confirmOrder", lang)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
