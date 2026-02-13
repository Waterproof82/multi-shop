"use client"

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"

export interface CartItem {
  item: MenuItemVM
  quantity: number
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: MenuItemVM, quantity?: number) => void
  removeItem: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
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

  const addItem = useCallback((item: MenuItemVM, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((ci) => ci.item.id === item.id)
      if (existing) {
          return prev.map((ci) =>
            ci.item.id === item.id ? { ...ci, quantity: ci.quantity + quantity } : ci
          )
      }
      return [...prev, { item, quantity }]
    })
  }, [])

  const removeItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((ci) => ci.item.id !== itemId))
  }, [])

  const updateQuantity = useCallback((itemId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((ci) => ci.item.id !== itemId))
    } else {
      setItems((prev) =>
        prev.map((ci) => (ci.item.id === itemId ? { ...ci, quantity } : ci))
      )
    }
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const totalItems = items.reduce((sum, ci) => sum + ci.quantity, 0)
  const totalPrice = items.reduce(
    (sum, ci) => sum + ci.item.price * ci.quantity,
    0
  )

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
