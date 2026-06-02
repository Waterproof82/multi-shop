"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  sesionPagada: boolean;
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

  const [productos, setProductos] = useState<Product[]>([]);
  const [productosLoading, setProductosLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);

  const refresh = useCallback(async () => {
    const data = await fetchSessionData(mesaId);
    setSessionData(data);
    setLoading(false);
  }, [mesaId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Load products once when table is open
  useEffect(() => {
    if (!loading && sessionData?.sesionId && productos.length === 0) {
      setProductosLoading(true);
      void fetchProductos().then(data => {
        setProductos(data.filter(p => p.activo));
        setProductosLoading(false);
      });
    }
  }, [loading, sessionData?.sesionId, productos.length]);

  const filteredProductos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(p => p.titulo_es.toLowerCase().includes(q));
  }, [productos, search]);

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
      setSearch("");
      await refresh();
    } finally {
      setOrderLoading(false);
    }
  }

  const isOpen = !!(sessionData?.sesionId);
  const isPaid = sessionData?.sesionPagada === true;
  const cartTotal = cart.reduce((sum, ci) => sum + ci.product.precio * ci.quantity, 0);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Closed table: keep minimal back + open action
  if (!isOpen) {
    return (
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push("/waiter/tables")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
            aria-label="Volver a las mesas"
          >
            ← {t("waiterTablesTitle", lang)}
          </button>
        </div>
        <button
          onClick={handleOpenTable}
          disabled={actionLoading}
          className="min-h-[44px] w-full rounded-lg bg-green-500 text-white font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-90"
        >
          {t("waiterTableOpenAction", lang)}
        </button>
      </div>
    );
  }

  // Open table: search replaces banner
  return (
    <div className="max-w-lg mx-auto flex flex-col gap-4">
      {/* Paid badge — shown instead of catalog when session is fully paid */}
      {isPaid && (
        <div className="flex items-center gap-2 rounded-xl border px-4 py-3" style={{ borderColor: 'oklch(60% 0.19 62 / 0.4)', backgroundColor: 'oklch(20% 0.06 62)' }}>
          <span style={{ color: 'oklch(70% 0.19 62)' }}>✓</span>
          <span className="text-sm font-semibold" style={{ color: 'oklch(70% 0.19 62)' }}>
            Cuenta pagada
          </span>
        </div>
      )}

      {/* Search input + product list — hidden when session is paid */}
      {!isPaid && (
        <>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              🔍
            </span>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Inline product list */}
          <div className="flex flex-col gap-2">
            {productosLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredProductos.length === 0 ? (
              search ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Sin resultados para &ldquo;{search}&rdquo;
                </p>
              ) : null
            ) : (
              filteredProductos.map(product => {
                const qty = cart.find(ci => ci.product.id === product.id)?.quantity ?? 0;
                return (
                  <div
                    key={product.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{product.titulo_es}</p>
                      <p className="text-xs text-muted-foreground">{formatPrice(product.precio, "EUR", lang)}</p>
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
                      <span className="w-6 text-center text-sm font-semibold text-foreground">{qty}</span>
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

          {/* Cart summary + confirm */}
          {cart.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("waiterTotal", lang)}</span>
                <span className="font-bold text-foreground">{formatPrice(cartTotal, "EUR", lang)}</span>
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
        </>
      )}

      {/* Running session total */}
      {sessionData && sessionData.total > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
          <span className="font-semibold text-foreground">{t("waiterTotal", lang)}</span>
          <span className="text-lg font-bold text-foreground">
            {formatPrice(sessionData.total, "EUR", lang)}
          </span>
        </div>
      )}

      {/* Orders list */}
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

      {/* Bottom actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.push("/waiter/tables")}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
          aria-label="Volver a las mesas"
        >
          ← {t("waiterTablesTitle", lang)}
        </button>
        <button
          onClick={handleCloseTable}
          disabled={actionLoading}
          className="min-h-[44px] px-4 rounded-lg border border-destructive text-destructive font-semibold text-sm disabled:opacity-50 transition-opacity hover:opacity-80"
        >
          {t("waiterTableCloseAction", lang)}
        </button>
      </div>
    </div>
  );
}
