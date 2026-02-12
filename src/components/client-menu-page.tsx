"use client";

import { useState } from "react"
import { SiteHeader } from "@/components/site-header"
import { HeroBanner } from "@/components/hero-banner"
import { CategoryNav } from "@/components/category-nav"
import { MenuSection } from "@/components/menu-section"
import { SiteFooter } from "@/components/site-footer"
import { CartDrawer } from "@/components/cart-drawer"
import { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"

interface MenuPageProps {
  menuData: MenuCategoryVM[]
}

export function MenuPage({ menuData }: MenuPageProps) {
  const [isCartOpen, setIsCartOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader onCartOpen={() => setIsCartOpen(true)} />
      <main className="flex-1">
        <HeroBanner />
        <div className="container mx-auto max-w-6xl px-4 py-8 md:px-6">
          {menuData.length > 0 ? (
            <>
              <CategoryNav categories={menuData} />
              <div className="mt-10 space-y-16 md:space-y-24">
                {menuData.map((category) => (
                  <MenuSection key={category.id} category={category} />
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
      <CartDrawer open={isCartOpen} onOpenChange={setIsCartOpen} />
    </div>
  )
}
