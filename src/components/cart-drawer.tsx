"use client"

import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { useCart } from "@/lib/cart-context"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

export function CartDrawer() {
  const { 
    items, 
    updateQuantity, 
    removeItem, 
    clearCart, 
    totalPrice, 
    isCartOpen, 
    closeCart 
  } = useCart()
  const { language } = useLanguage()

  return (
    <Sheet open={isCartOpen} onOpenChange={closeCart}>
      <SheetContent className="flex w-full flex-col sm:max-w-md bg-background">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-serif text-foreground">
            <ShoppingBag className="size-5" />
            {t("yourOrder", language)}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <ShoppingBag className="size-12 opacity-30" />
            <p className="text-lg">{t("emptyCart", language)}</p>
            <p className="text-sm">{t("addDishesToStart", language)}</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-3 py-4">
                {items.map((ci) => (
                  <div key={ci.item.id} className="flex items-center gap-3 rounded-lg bg-card p-3">
                    <div className="flex-1">
                      <p className="font-semibold text-card-foreground">
                        {(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {ci.item.price.toFixed(2).replace(".", ",")}{"€"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7 bg-transparent"
                        onClick={() => updateQuantity(ci.item.id, ci.quantity - 1)}
                        aria-label={t("reduceQuantity", language)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="w-6 text-center font-semibold text-foreground">{ci.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7 bg-transparent"
                        onClick={() => updateQuantity(ci.item.id, ci.quantity + 1)}
                        aria-label={t("increaseQuantity", language)}
                      >
                        <Plus className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive hover:text-destructive"
                        onClick={() => removeItem(ci.item.id)}
                        aria-label={`${t("remove", language)} ${(language !== "es" && ci.item.translations?.[language]?.name) || ci.item.name}`}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 pb-6 px-2 bg-background/80 shadow-[0_-2px_16px_0_rgba(0,0,0,0.04)] rounded-b-xl">
              <div className="mb-4 flex items-center justify-between px-2">
                <span className="text-lg font-semibold text-foreground">{t("total", language)}</span>
                <span className="font-serif text-2xl font-bold text-foreground">
                  {totalPrice.toFixed(2).replace(".", ",") + "€"}
                </span>
              </div>

              <div className="flex flex-col gap-2 px-1">
                <Button 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-full py-3 text-lg font-semibold shadow-md transition-all duration-200"
                  size="lg"
                >
                  {t("confirmOrder", language)}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground rounded-full py-2 font-medium hover:bg-muted/40 transition-all duration-200"
                  onClick={clearCart}
                >
                  {t("clearCart", language)}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
