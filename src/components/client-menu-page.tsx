"use client";

import { ReactNode } from "react"
import { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { HeroBanner } from "@/components/hero-banner"
import { CategoryNav } from "@/components/category-nav"
import { MenuSection } from "@/components/menu-section"
import { SiteFooter } from "@/components/site-footer"
import { CartDrawer } from "@/components/cart-drawer"
import { CartToast } from "@/components/cart-toast"
import { PromoNotification } from "@/components/promo-notification"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface MenuPageProps {
  menuData: MenuCategoryVM[];
  header?: ReactNode;
  showCart?: boolean;
  empresa?: EmpresaPublic | null;
}

export function MenuPage({ menuData, header, showCart = false, empresa }: Readonly<MenuPageProps>) {
  return (
    <div className="flex min-h-screen flex-col bg-background" suppressHydrationWarning>
      {header === undefined ? null : header}
      <PromoNotification />
      <main className="flex-1">
        <HeroBanner empresa={empresa} />
        {menuData.length > 0 ? (
          <>
            <CategoryNav categories={menuData} />
            <div className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
              <div className="space-y-12 md:space-y-16">
                {menuData.map((category, index) => (
                  <MenuSection key={category.id} category={category} showCart={showCart} priority={index === 0} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
            <div className="text-center py-20">
              <p className="text-xl text-muted-foreground">Menú no disponible en este momento.</p>
            </div>
          </div>
        )}
      </main>
      <SiteFooter empresa={empresa} />
      <CartDrawer />
      {showCart && <CartToast />}
    </div>
  );
}
