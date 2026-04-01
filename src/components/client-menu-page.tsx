"use client";

import { ReactNode, Suspense } from "react"
import dynamic from "next/dynamic"
import { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { HeroBanner } from "@/components/hero-banner"
import { CategoryNav } from "@/components/category-nav"
import { MenuSection } from "@/components/menu-section"
import { SiteFooter } from "@/components/site-footer"
import { CartToast } from "@/components/cart-toast"
import { PromoNotification } from "@/components/promo-notification"
import type { EmpresaPublic } from "@/core/domain/entities/types"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

// Lazy load cart components - only needed when showCart is true
const CartDrawer = dynamic(
  () => import("@/components/cart-drawer").then(mod => ({ default: mod.CartDrawer })),
  { ssr: false }
)

interface MenuPageProps {
  menuData: MenuCategoryVM[];
  header?: ReactNode;
  showCart?: boolean;
  empresa?: EmpresaPublic | null;
}

export function MenuPage({ menuData, header, showCart = false, empresa }: Readonly<MenuPageProps>) {
  const { language } = useLanguage();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Skip to main content link for accessibility */}
      <a
        href="#menu-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {t("skipToContent", language)}
      </a>
      {header === undefined ? null : header}
      <PromoNotification />
      <div className="flex-1">
        <HeroBanner empresa={empresa} />
        {menuData.length > 0 ? (
          <>
            <CategoryNav categories={menuData} />
            <div id="menu-content" className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
              <div className="space-y-12 md:space-y-16">
                {menuData.map((category, index) => (
                  <MenuSection key={category.id} category={category} showCart={showCart} priority={index === 0} />
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
      {/* Only render cart components when needed */}
      {showCart && (
        <>
          <CartDrawer />
          <CartToast />
        </>
      )}
    </div>
  );
}
