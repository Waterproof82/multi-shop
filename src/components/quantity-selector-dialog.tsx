"use client"

import { useState, useEffect } from "react"
import { Plus, Minus } from "lucide-react"
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

interface QuantitySelectorDialogProps {
  item: MenuItemVM | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddToCart: (item: MenuItemVM, quantity: number) => void
}

export function QuantitySelectorDialog({
  item,
  open,
  onOpenChange,
  onAddToCart,
}: QuantitySelectorDialogProps) {
  const [quantity, setQuantity] = useState(1)
  const { language } = useLanguage()

  const handleQuantityChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(event.target.value, 10)
    if (!isNaN(value) && value >= 1) {
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

  const handleConfirmAddToCart = () => {
    if (item && quantity > 0) {
      onAddToCart(item, quantity)
      onOpenChange(false)
      setQuantity(1) // Reset quantity for next time
    }
  }

  // Reset quantity when dialog opens with a new item or closes
  useEffect(() => {
    if (open && item) {
      setQuantity(1) // Reset to 1 when a new item is selected for the dialog
    } else if (!open) {
      setQuantity(1) // Reset when dialog closes
    }
  }, [open, item])


  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("selectQuantity", language)}</DialogTitle>
          <DialogDescription>
            {t("quantityFor", language)} {item.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
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
          <div className="flex justify-between items-center text-lg font-bold">
            <span>{t("total", language)}:</span>
            <span>{(item.price * quantity).toFixed(2).replace(".", ",")}€</span>
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
