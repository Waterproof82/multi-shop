"use client"

import { useState } from "react"
import { CartProvider } from "@/lib/cart-context"
import { LanguageProvider } from "@/lib/language-context"
import { SiteHeader } from "@/components/site-header"
import { HeroBanner } from "@/components/hero-banner"
import { CategoryNav } from "@/components/category-nav"
import { MenuSection } from "@/components/menu-section"
import { CartDrawer } from "@/components/cart-drawer"
import { SiteFooter } from "@/components/site-footer"
import { menuCategories } from "@/lib/menu-data"

export default function Home() {
  const [cartOpen, setCartOpen] = useState(false)

  return (
    <LanguageProvider>
      <CartProvider>
        <div className="min-h-screen bg-background">
          <SiteHeader onCartOpen={() => setCartOpen(true)} />
          <HeroBanner />

          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <CategoryNav categories={menuCategories} />

            <main className="flex flex-col gap-12 py-8 md:py-12">
              {menuCategories.map((category) => (
                <MenuSection key={category.id} category={category} />
              ))}
            </main>
          </div>

          <SiteFooter />
          <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
        </div>
      </CartProvider>
    </LanguageProvider>
  )
}
