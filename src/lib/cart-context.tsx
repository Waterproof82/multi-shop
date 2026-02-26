"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"

export interface Complement {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export interface CartItem {
  item: MenuItemVM
  quantity: number
  selectedComplements?: Complement[]
}

function getItemKey(item: MenuItemVM, complements?: Complement[]): string {
  const complementIds = complements?.map(c => c.id).sort().join(',') || '';
  return `${item.id}-${complementIds}`;
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: MenuItemVM, quantity?: number, selectedComplements?: Complement[]) => void
  removeItem: (itemKey: string) => void
  updateQuantity: (itemKey: string, quantity: number) => void
  clearCart: () => void
  totalItems: number
  totalPrice: number
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)

  const openCart = useCallback(() => setIsCartOpen(true), [])
  const closeCart = useCallback(() => setIsCartOpen(false), [])

  const addItem = useCallback((item: MenuItemVM, quantity = 1, selectedComplements?: Complement[]) => {
    const itemKey = getItemKey(item, selectedComplements);
    setItems((prev) => {
      const existingIndex = prev.findIndex((ci) => getItemKey(ci.item, ci.selectedComplements) === itemKey);
      if (existingIndex >= 0) {
        return prev.map((ci, index) =>
          index === existingIndex ? { ...ci, quantity: ci.quantity + quantity } : ci
        )
      }
      return [...prev, { item, quantity, selectedComplements }]
    })
  }, [])

  const removeItem = useCallback((itemKey: string) => {
    setItems((prev) => prev.filter((ci) => getItemKey(ci.item, ci.selectedComplements) !== itemKey))
  }, [])

  const updateQuantity = useCallback((itemKey: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((ci) => getItemKey(ci.item, ci.selectedComplements) !== itemKey))
    } else {
      setItems((prev) =>
        prev.map((ci) => (getItemKey(ci.item, ci.selectedComplements) === itemKey ? { ...ci, quantity } : ci))
      )
    }
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const totalItems = items.reduce((sum, ci) => sum + ci.quantity, 0)
  const totalPrice = items.reduce((sum, ci) => {
    const complementPrice = ci.selectedComplements?.reduce((s, c) => s + c.price, 0) || 0;
    return sum + (ci.item.price + complementPrice) * ci.quantity;
  }, 0)

  const contextValue = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
    isCartOpen,
    openCart,
    closeCart,
  }), [items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, isCartOpen, openCart, closeCart]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}
