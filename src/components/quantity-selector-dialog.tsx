"use client"

import { useState, useRef, useEffect } from "react"
import { Plus, Minus, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RippleButton } from "@/components/ui/ripple-button"
import { useLanguage } from "@/lib/language-context"
import { useCart } from "@/lib/cart-context"
import { t } from "@/lib/translations"
import { formatPrice } from "@/lib/format-price"
import type { MenuItemVM, ComplementVM } from "@/core/application/dtos/menu-view-model"

interface QuantitySelectorDialogProps {
  item: MenuItemVM | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuantitySelectorDialog(props: Readonly<QuantitySelectorDialogProps>) {
  const { item, open, onOpenChange } = props;
  const [quantity, setQuantity] = useState(1)
  const [selectedComplement, setSelectedComplement] = useState<ComplementVM | null>(null)
  const [addedAnimation, setAddedAnimation] = useState(false)
  const { language } = useLanguage()
  const { addItem } = useCart()

  const complements = item?.complements || [];

  const handleIncrement = () => {
    setQuantity((prev) => prev + 1)
  }

  const handleDecrement = () => {
    setQuantity((prev) => Math.max(1, prev - 1))
  }

  const toggleComplement = (complement: ComplementVM) => {
    if (selectedComplement?.id === complement.id) {
      setSelectedComplement(null);
    } else {
      setSelectedComplement(complement);
    }
  }

  const handleConfirmAddToCart = () => {
    if (item && quantity > 0) {
      if (item.requiresComplement && !selectedComplement) {
        return;
      }
      addItem(item, quantity, selectedComplement ? [selectedComplement] : undefined);
      setAddedAnimation(true);
      setTimeout(() => {
        onOpenChange(false);
        setQuantity(1);
        setSelectedComplement(null);
        setAddedAnimation(false);
      }, 300);
    }
  }

  // Reset quantity when dialog opens with a new item or closes
  const previousOpenRef = useRef(open);
  const previousItemIdRef = useRef(item?.id);
  
  useEffect(() => {
    if (open && item && (!previousOpenRef.current || previousItemIdRef.current !== item.id)) {
      setQuantity(1);
      setSelectedComplement(null);
    }
    
    previousOpenRef.current = open;
    previousItemIdRef.current = item?.id;
  }, [open, item]);

  const totalComplementsPrice = selectedComplement ? selectedComplement.price : 0;
  const totalPrice = (item ? item.price + totalComplementsPrice : 0) * quantity;

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(calc(100vw-2rem),425px)] flex flex-col max-h-[80vh]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("selectQuantity", language)}</DialogTitle>
          <DialogDescription>
            {t("quantityFor", language)} {(language !== "es" && item.translations?.[language]?.name) || item.name}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto min-h-0">
          {complements.length > 0 && (
            <div className="space-y-2 pb-4">
              <Label className="text-sm font-medium">
                {item.requiresComplement ? t("complementsRequired", language) : t("complementsOptional", language)}
              </Label>
              <div className="space-y-2" role="radiogroup" aria-label={item.requiresComplement ? t("complementsRequired", language) : t("complementsOptional", language)}>
                {complements.map((complement) => {
                  const isSelected = selectedComplement?.id === complement.id;
                  const lang = (['en', 'fr', 'it', 'de'].includes(language) ? language : undefined) as 'en' | 'fr' | 'it' | 'de' | undefined;
                  const compName = lang && complement.translations?.[lang]?.name
                    ? complement.translations[lang].name
                    : complement.name;
                  const compDesc = lang && complement.translations?.[lang]?.description
                    ? complement.translations[lang].description
                    : complement.description;
                  return (
                    <button
                      key={complement.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => toggleComplement(complement)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        isSelected
                          ? 'border-primary bg-primary/10 animate-complement-select'
                          : 'border-border hover:border-border/80 hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/30'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground animate-quantity-pulse" />}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">{compName}</p>
                          {compDesc && (
                            <p className="text-xs text-muted-foreground">{compDesc}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold text-sm">
                        +{formatPrice(complement.price, 'EUR', language)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-4 space-y-3 shrink-0">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="quantity" className="text-right">
              {t("quantity", language)}
            </Label>
            <div className="col-span-3 flex items-center justify-center">
              <RippleButton
                variant="outline"
                size="icon"
                className="h-11 w-11 md:h-10 md:w-10"
                onClick={handleDecrement}
                disabled={quantity <= 1}
                aria-label={t("reduceQuantity", language)}
              >
                <Minus className="h-4 w-4" />
              </RippleButton>
              <Input
                id="quantity"
                type="text"
                value={quantity}
                className="mx-1 h-10 w-12 flex items-center justify-center text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                readOnly
                tabIndex={0}
                aria-live="polite"
                aria-label={t("quantity", language)}
              />
              <RippleButton variant="outline" size="icon" className="h-11 w-11 md:h-10 md:w-10" onClick={handleIncrement} aria-label={t("increaseQuantity", language)}>
                <Plus className="h-4 w-4" />
              </RippleButton>
            </div>
          </div>
          <div className="flex justify-between items-center text-lg font-bold">
            <span>{t("total", language)}:</span>
            <span className="animate-price-update" key={totalPrice}>{formatPrice(totalPrice, 'EUR', language)}</span>
          </div>
        </div>
        
        <DialogFooter className="shrink-0">
          <RippleButton 
            type="button" 
            onClick={handleConfirmAddToCart} 
            disabled={quantity < 1 || (item.requiresComplement && !selectedComplement)}
            className={addedAnimation ? 'animate-complement-select' : ''}
          >
            {addedAnimation ? (
              <span className="flex items-center gap-2">
                <Check className="w-4 h-4" />
              </span>
            ) : (
              t("addToCart", language)
            )}
          </RippleButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
