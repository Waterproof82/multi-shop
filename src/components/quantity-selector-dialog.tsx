"use client"

import { useState, useEffect, useId } from "react"
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
  onAddToCart: (item: MenuItemVM, quantity: number, selectedComplements?: Complement[]) => void
}

export function QuantitySelectorDialog(props: Readonly<QuantitySelectorDialogProps>) {
  const { item, open, onOpenChange, onAddToCart } = props;
  const [quantity, setQuantity] = useState(1)
  const [selectedComplements, setSelectedComplements] = useState<Complement[]>([])
  const { language } = useLanguage()
  const descriptionId = useId()

  const complements = item?.complements || [];

  const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(event.target.value, 10)
    if (!Number.isNaN(value) && value >= 1) {
      setQuantity(value)
    } else if (event.target.value === "") {
      setQuantity(0) // Allow empty input temporarily for typing
    }
  }

  const handleIncrement = () => {
    setQuantity((prev) => prev + 1)
  }

  const handleDecrement = () => {
    setQuantity((prev) => Math.max(1, prev - 1))
  }

  const toggleComplement = (complement: Complement) => {
    setSelectedComplements((prev) => {
      const exists = prev.find((c) => c.id === complement.id);
      if (exists) {
        return prev.filter((c) => c.id !== complement.id);
      }
      return [...prev, complement];
    });
  }

  const handleConfirmAddToCart = () => {
    if (item && quantity > 0) {
      onAddToCart(item, quantity, selectedComplements);
      onOpenChange(false);
      setQuantity(1); // Reset quantity for next time
      setSelectedComplements([]);
    }
  }

  // Reset quantity when dialog opens with a new item or closes
  useEffect(() => {
    if (open && item) {
      setQuantity(1); // Reset to 1 when a new item is selected for the dialog
      setSelectedComplements([]);
    }
  }, [open, item])

  const totalComplementsPrice = selectedComplements.reduce((sum, c) => sum + c.price, 0);
  const totalPrice = (item ? item.price + totalComplementsPrice : 0) * quantity;

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("selectQuantity", language)}</DialogTitle>
          <DialogDescription>
            {t("quantityFor", language)} {(language !== "es" && item.translations?.[language]?.name) || item.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
          {complements.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Complementos (opcional)
              </Label>
              <div className="space-y-2">
                {complements.map((complement) => {
                  const isSelected = selectedComplements.some((c) => c.id === complement.id);
                  return (
                    <button
                      key={complement.id}
                      type="button"
                      onClick={() => toggleComplement(complement)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        isSelected 
                          ? 'border-primary bg-primary/10' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-primary border-primary' : 'border-gray-300'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
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
          
          <div className="grid grid-cols-4 items-center gap-4 pt-2 border-t">
            <Label htmlFor="quantity" className="text-right">
              {t("quantity", language)}
            </Label>
            <div className="col-span-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleDecrement}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="quantity"
                type="number"
                value={quantity}
                onChange={handleQuantityChange}
                className="w-16 text-center"
                min="1"
              />
              <Button variant="outline" size="icon" onClick={handleIncrement}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
            <span>{t("total", language)}:</span>
            <span>{totalPrice.toFixed(2).replace(".", ",")}€</span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={handleConfirmAddToCart} disabled={quantity < 1}>
            {t("addToCart", language)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
