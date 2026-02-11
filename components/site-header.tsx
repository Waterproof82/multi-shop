"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/lib/cart-context"
import { LanguageSelector } from "@/components/language-selector"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

interface SiteHeaderProps {
  onCartOpen: () => void
}

export function SiteHeader({ onCartOpen }: SiteHeaderProps) {
  const { totalItems } = useCart()
  const { language } = useLanguage()

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <a href="/" className="flex items-center gap-2">
          <img
            src="/images/mermelada-tomate-web-transp-sombra-1920w.webp"
            alt="Mermelada de Tomate"
            className="h-12 w-auto md:h-16"
          />
        </a>

        <div className="flex items-center gap-1">
          <LanguageSelector />
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={onCartOpen}
            aria-label={t("openCart", language)}
          >
            <ShoppingCart className="size-5" />
            {totalItems > 0 && (
              <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {totalItems}
              </span>
            )}
          </Button>
        </div>
      </div>
    </header>
  )
}
