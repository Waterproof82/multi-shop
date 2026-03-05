"use client"

import { useState, useRef } from "react"
import { Plus, Minus, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/language-context"
import { useCart } from "@/lib/cart-context"
import { t } from "@/lib/translations"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"

interface Complement {
  id: string;
  name: string;
  price: number;
  description?: string;
}

interface QuantitySelectorDialogProps {
  item: MenuItemVM | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuantitySelectorDialog(props: Readonly<QuantitySelectorDialogProps>) {
  const { item, open, onOpenChange } = props;
  const [quantity, setQuantity] = useState(1)
  const [selectedComplement, setSelectedComplement] = useState<Complement | null>(null)
  const { language } = useLanguage()
  const { addItem } = useCart()

  const complements = item?.complements || [];

  const handleIncrement = () => {
    setQuantity((prev) => prev + 1)
  }

  const handleDecrement = () => {
    setQuantity((prev) => Math.max(1, prev - 1))
  }

  const toggleComplement = (complement: Complement) => {
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
      onOpenChange(false);
      setQuantity(1);
      setSelectedComplement(null);
    }
  }

  // Reset quantity when dialog opens with a new item or closes
  const previousOpenRef = useRef(open);
  const previousItemIdRef = useRef(item?.id);
  
  if (open && item && (!previousOpenRef.current || previousItemIdRef.current !== item.id)) {
    setQuantity(1);
    setSelectedComplement(null);
  }
  
  previousOpenRef.current = open;
  previousItemIdRef.current = item?.id;

  const totalComplementsPrice = selectedComplement ? selectedComplement.price : 0;
  const totalPrice = (item ? item.price + totalComplementsPrice : 0) * quantity;

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] flex flex-col max-h-[80vh]">
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
              <div className="space-y-2">
                {complements.map((complement) => {
                  const isSelected = selectedComplement?.id === complement.id;
                  return (
                    <button
                      key={complement.id}
                      type="button"
                      onClick={() => toggleComplement(complement)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isSelected 
                          ? 'border-primary bg-primary/10' 
                          : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          isSelected 
                            ? 'bg-primary border-primary dark:bg-primary dark:border-primary' 
                            : 'border-gray-300 dark:border-gray-600'
                        }`}>
                          {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-sm">{complement.name}</p>
                          {complement.description && (
                            <p className="text-xs text-gray-500">{complement.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold text-sm">
                        +{complement.price.toFixed(2).replace(".", ",")}€
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
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={handleDecrement}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="quantity"
                type="text"
                value={quantity}
                className="mx-1 h-10 w-12 flex items-center justify-center text-center text-lg font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                readOnly
                tabIndex={-1}
              />
              <Button variant="outline" size="icon" className="h-10 w-10" onClick={handleIncrement}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex justify-between items-center text-lg font-bold">
            <span>{t("total", language)}:</span>
            <span>{totalPrice.toFixed(2).replace(".", ",")}€</span>
          </div>
        </div>
        
        <DialogFooter className="shrink-0">
          <Button 
            type="button" 
            onClick={handleConfirmAddToCart} 
            disabled={quantity < 1 || (item.requiresComplement && !selectedComplement)}
          >
            {t("addToCart", language)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
