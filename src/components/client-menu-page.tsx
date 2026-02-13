"use client";

import { useState, ReactNode, useEffect } from "react"
import { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { HeroBanner } from "@/components/hero-banner"
import { CategoryNav } from "@/components/category-nav"
import { MenuSection } from "@/components/menu-section"
import { SiteFooter } from "@/components/site-footer"
import { CartDrawer } from "@/components/cart-drawer"
import { checkCartAuthorization } from "@/app/actions"



interface MenuPageProps {
  menuData: MenuCategoryVM[];
  header?: ReactNode;
  showCart?: boolean;
  tokenExpiresAt?: number | null;
}

export function MenuPage({ menuData, header, showCart = false, tokenExpiresAt }: MenuPageProps) {
  const [isAuthorized, setIsAuthorized] = useState(showCart);

  useEffect(() => {
    if (!tokenExpiresAt) {
      setIsAuthorized(showCart);
      return;
    }

    const checkExpiration = () => {
      const now = Date.now();
      if (now >= tokenExpiresAt) {
        setIsAuthorized(false);
      } else {
        setIsAuthorized(showCart);
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 1000);
    return () => clearInterval(interval);
  }, [showCart, tokenExpiresAt]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {typeof header !== 'undefined' ? header : null}
      <main className="flex-1">
        <HeroBanner />
        <div className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
          {menuData.length > 0 ? (
            <>
              <CategoryNav categories={menuData} />
              <div className="mt-10 space-y-16 md:space-y-24">
                {menuData.map((category) => (
                  <MenuSection key={category.id} category={category} showCart={isAuthorized} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-20">
              <p className="text-xl text-muted-foreground">Menú no disponible en este momento.</p>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
      <CartDrawer />
    </div>
  );
}

