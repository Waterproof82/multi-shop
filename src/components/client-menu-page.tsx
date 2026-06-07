"use client";

import { ReactNode, Suspense, useState, useMemo, useEffect, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"
import dynamic from "next/dynamic"
import { MenuCategoryVM, MenuItemVM } from "@/core/application/dtos/menu-view-model"
import { HeroBanner } from "@/components/hero-banner"
import { CategoryNav } from "@/components/category-nav"
import { MenuSection } from "@/components/menu-section"
import { SiteFooter } from "@/components/site-footer"
import { PromoNotification } from "@/components/promo-notification"
import { ActiveOrderBanner } from "@/components/active-order-banner"
import type { EmpresaPublic } from "@/core/domain/entities/types"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { formatPrice } from "@/lib/format-price"
import { getWaiterMesa } from "@/components/waiter-login-form"
import { useCart } from "@/lib/cart-context"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"

// Lazy load cart components - only needed when showCart is true
const CartDrawer = dynamic(
  () => import("@/components/cart-drawer").then(mod => ({ default: mod.CartDrawer })),
  { ssr: false }
)

// Lazy load mesa order history panel - only renders when ?mesa= param is present
const MesaOrderHistory = dynamic(
  () => import("@/components/mesa-order-history").then(mod => ({ default: mod.MesaOrderHistory })),
  { ssr: false }
)

// Lazy load welcome discount popup - only needed when feature is enabled
const WelcomeDiscountPopup = dynamic(
  () => import("@/components/welcome-discount-popup").then(mod => ({ default: mod.WelcomeDiscountPopup })),
  { ssr: false }
)

interface MenuPageProps {
  menuData: MenuCategoryVM[];
  header?: ReactNode;
  showCart?: boolean;
  empresa?: EmpresaPublic | null;
  isWaiterMode?: boolean;
}

function WaiterProductSearch({ menuData, showCart, empresa }: { menuData: MenuCategoryVM[]; showCart: boolean; empresa?: EmpresaPublic | null }) {
  const { language } = useLanguage();
  const lang = language as Parameters<typeof t>[1];
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItemVM | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const allProducts = useMemo<MenuItemVM[]>(() =>
    menuData.flatMap(cat => cat.items),
    [menuData]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [allProducts, search]);

  const handleAdd = (product: MenuItemVM) => {
    setSelectedItem(product);
    setIsDialogOpen(true);
  };

  return (
    <div className="w-full px-4 py-3 max-w-2xl mx-auto flex flex-col gap-3">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none text-base">🔍</span>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          autoFocus
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {search.trim() && (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Sin resultados para &ldquo;{search}&rdquo;
            </p>
          ) : (
            filtered.map(product => (
              <div
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(product.price, empresa?.moneda ?? "EUR", lang)}
                  </p>
                </div>
                {showCart && (
                  <button
                    type="button"
                    onClick={() => handleAdd(product)}
                    className="min-h-[40px] px-4 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold shrink-0 transition-opacity hover:opacity-90"
                  >
                    + {t("addToCart", lang)}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <QuantitySelectorDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
        }}
      />
    </div>
  );
}

function getCategoryTab(cat: MenuCategoryVM): 'comida' | 'bebida' | 'both' | 'empty' {
  const hasBebida = cat.items.some(i => i.tipoProducto === 'bebida');
  const hasComida = cat.items.some(i => !i.tipoProducto || i.tipoProducto === 'comida');
  if (hasBebida && hasComida) return 'both';
  if (hasBebida) return 'bebida';
  if (hasComida) return 'comida';
  return 'empty';
}

export function MenuPage({ menuData, header, showCart = false, empresa, isWaiterMode = false }: Readonly<MenuPageProps>) {
  const { language } = useLanguage();
  const { clearCart, closeCart } = useCart();
  // Mirror exactly the WaiterBanner condition: waiter_token (server) + mesa selected (sessionStorage)
  const [waiterHasMesa, setWaiterHasMesa] = useState(false);
  const [waiterMesaLocked, setWaiterMesaLocked] = useState(false);
  const [menuTab, setMenuTab] = useState<'comida' | 'bebidas'>('comida');
  const [mesaEsperandoActivacion, setMesaEsperandoActivacion] = useState(false);
  const [mesaPaymentLocked, setMesaPaymentLocked] = useState(false);

  useEffect(() => {
    if (isWaiterMode) {
      setWaiterHasMesa(!!getWaiterMesa());
    }
  }, [isWaiterMode]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mesa = params.get('mesa');
    if (!mesa) return;

    // Polling: detect sesionPagada (fully paid) and division state (10s is fine — not time-critical)
    const check = async () => {
      try {
        const res = await fetch(`/api/mesas/${encodeURIComponent(mesa)}/orders`);
        if (!res.ok) return;
        const data = await res.json() as { sesionPagada?: boolean; pagoEnCurso?: boolean; division?: unknown };
        const pagada = data.sesionPagada === true;
        const enCurso = data.pagoEnCurso === true;
        const divisionActiva = data.division != null;
        if (isWaiterMode) {
          if (pagada || enCurso || divisionActiva) {
            setWaiterMesaLocked(true);
            window.location.href = `/mesa/${encodeURIComponent(mesa)}/orders`;
          }
        } else {
          setMesaEsperandoActivacion(pagada);
          if (pagada) {
            clearCart();
            closeCart();
          } else if (enCurso || divisionActiva) {
            setMesaPaymentLocked(true);
            clearCart();
            closeCart();
            window.location.href = `/mesa/${encodeURIComponent(mesa)}/orders`;
          }
        }
      } catch { /* best-effort */ }
    };
    void check();
    const interval = setInterval(() => { void check(); }, 10000);

    // Realtime: detect pago_en_curso immediately — fires as soon as any user clicks "Pagar"
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const channel = supabase
      .channel(`mesa-payment:${mesa}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'mesa_sesiones',
        filter: `mesa_id=eq.${mesa}`,
      }, (payload: { new: Record<string, unknown> }) => {
        const pagoEnCurso = payload.new['pago_en_curso'] === true;
        const sesionPagada = payload.new['sesion_pagada'] === true;
        if (isWaiterMode) {
          if (pagoEnCurso || sesionPagada) {
            setWaiterMesaLocked(true);
            window.location.href = `/mesa/${encodeURIComponent(mesa)}/orders`;
          }
        } else if (pagoEnCurso) {
          setMesaPaymentLocked(true);
          clearCart();
          closeCart();
          window.location.href = `/mesa/${encodeURIComponent(mesa)}/orders`;
        }
      })
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [clearCart, closeCart, isWaiterMode]);

  // Trap the browser back button while the "mesa en preparación" overlay is active
  // so the user cannot navigate away from the waiting screen.
  useEffect(() => {
    if (!mesaEsperandoActivacion) return;
    window.history.pushState({ mesaWaiting: true }, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState({ mesaWaiting: true }, '', window.location.href);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [mesaEsperandoActivacion]);

  const showWaiterSearch = isWaiterMode && waiterHasMesa && !waiterMesaLocked;

  const isRestaurant = empresa?.tipo === 'restaurante';
  const showTabs = isRestaurant && menuData.some(cat => cat.items.some(i => i.tipoProducto === 'bebida'));

  const visibleCategories = useMemo(() => {
    if (!showTabs) return menuData;
    return menuData.filter(cat => {
      const type = getCategoryTab(cat);
      if (menuTab === 'bebidas') return type === 'bebida' || type === 'both';
      return type === 'comida' || type === 'both' || type === 'empty';
    });
  }, [menuData, showTabs, menuTab]);

  const handleTabChange = useCallback((tab: 'comida' | 'bebidas') => {
    setMenuTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Mesa waiting-for-activation overlay — never shown to waiters, they manage the table */}
      {mesaEsperandoActivacion && !isWaiterMode && (
        <div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 px-8 text-center"
          style={{ backgroundColor: 'rgba(10, 8, 6, 0.95)' }}
          aria-live="polite"
        >
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 72, height: 72, backgroundColor: 'rgba(255,252,247,0.08)' }}
          >
            <span style={{ fontSize: 36 }}>🍽️</span>
          </div>
          <div className="flex flex-col gap-3 max-w-xs">
            <p
              className="text-lg font-bold tracking-widest uppercase"
              style={{ color: '#fffcf7', fontFamily: 'monospace' }}
            >
              {t('mesaEsperandoActivacion', language as Parameters<typeof t>[1])}
            </p>
            <p
              className="text-sm leading-relaxed"
              style={{ color: '#8a7560', fontFamily: 'monospace' }}
            >
              {t('mesaEsperandoActivacionDesc', language as Parameters<typeof t>[1])}
            </p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: '#8a7560',
                  animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skip to main content link for accessibility */}
      <a
        href="#menu-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t("skipToContent", language)}
      </a>

      {/* Show waiter search only when WaiterBanner is active (token + mesa selected) */}
      {showWaiterSearch ? (
        <WaiterProductSearch menuData={menuData} showCart={showCart} empresa={empresa} />
      ) : (
        <>
          {header === undefined ? null : header}
          <PromoNotification />
          <HeroBanner empresa={empresa} bannerFit={empresa?.bannerFit ?? "contain"} />
        </>
      )}

      <div className="flex-1">
        {menuData.length > 0 ? (
          <>
            <CategoryNav
              categories={visibleCategories}
              showTabs={showTabs}
              tab={menuTab}
              onTabChange={handleTabChange}
              isWaiterMode={showWaiterSearch}
            />
            <div id="menu-content" className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
              <div className="space-y-12 md:space-y-16">
                {visibleCategories.map((category, index) => (
                  <MenuSection key={category.id} category={category} showCart={showCart && !mesaPaymentLocked && !mesaEsperandoActivacion} priority={index === 0} hideImages={showWaiterSearch} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div id="menu-content" className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
            <div className="text-center py-20">
              <p className="text-xl text-muted-foreground">{t("menuNotAvailable", language)}</p>
            </div>
          </div>
        )}
      </div>
      <SiteFooter empresa={empresa} />
      {/* Welcome discount popup - shows after 30 seconds for empresas with feature enabled */}
      {showCart && empresa?.descuentoBienvenidaActivo && (
        <WelcomeDiscountPopup
          empresaId={empresa.id}
          empresaNombre={empresa.nombre}
          porcentaje={empresa.descuentoBienvenidaPorcentaje}
          idioma={language}
        />
      )}
      {/* Cart components — only when cart is active */}
      {showCart && !mesaEsperandoActivacion && (
        <>
          <CartDrawer isRestaurant={empresa?.tipo === 'restaurante'} pagosPickupHabilitados={empresa?.pagosPickupHabilitados} />
          <ActiveOrderBanner />
        </>
      )}
      {/* Mesa order history — shown whenever a mesa param is present, even in read-only mode
          (mesas disabled: customer can still view their existing ticket) */}
      {!mesaEsperandoActivacion && <MesaOrderHistory />}
    </div>
  );
}
