"use client"

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"
import { getItemKey } from "./cart-utils"

export interface Complement {
  id: string;
  name: string;
  price: number;
  description?: string;
}

export interface CartItem {
  cartId: string           // unique per cart entry — allows same product deferred + non-deferred simultaneously
  item: MenuItemVM
  quantity: number
  selectedComplements?: Complement[]
  justAdded?: boolean
  justRemoved?: boolean
  deferred?: boolean      // waiter marked this item to send later
  fromPending?: boolean   // kept for compat but no longer set; DB items load as deferred
}

function newCartId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export interface AddedItemInfo {
  name: string;
  translations?: MenuItemVM['translations'];
  quantity: number;
  price: number;
  totalPrice: number;
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: MenuItemVM, quantity?: number, selectedComplements?: Complement[], deferred?: boolean) => void
  removeItem: (cartId: string) => void
  updateQuantity: (cartId: string, quantity: number) => void
  clearCart: () => void
  clearNonDeferred: () => void
  toggleDeferred: (cartId: string) => void
  releaseAllDeferred: () => void
  totalItems: number
  totalPrice: number
  isCartOpen: boolean
  openCart: () => void
  closeCart: () => void
  lastAddedItem: AddedItemInfo | null
}

const CartContext = createContext<CartContextType | undefined>(undefined)

export function CartProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [lastAddedItem, setLastAddedItem] = useState<AddedItemInfo | null>(null)

  // Manejar botón atrás del navegador para cerrar el carrito en lugar de salir
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (isCartOpen) {
        // Prevent default navigation and close cart instead
        event.preventDefault();
        setIsCartOpen(false);
        // Push state back so next back button works normally
        window.history.pushState(null, '', window.location.href);
      }
    };

    if (isCartOpen) {
      // Agregar estado al historial cuando se abre el carrito
      window.history.pushState({ cartOpen: true }, '', window.location.href);
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isCartOpen]);

  const openCart = useCallback(() => {
    setLastAddedItem(null);
    setIsCartOpen(true);
  }, [])
  const closeCart = useCallback(() => {
    setIsCartOpen(false);
    // Neutralize the cartOpen history entry without navigating (history.back() triggers
    // the browser "leave page?" dialog on mobile when previous entry is cross-origin)
    if (window.history.state?.cartOpen) {
      window.history.replaceState({}, '', window.location.href);
    }
  }, [])

  const addItem = useCallback((item: MenuItemVM, quantity = 1, selectedComplements?: Complement[], deferred?: boolean) => {
    const itemKey = getItemKey(item, selectedComplements);
    const complementPrice = selectedComplements?.reduce((s, c) => s + c.price, 0) || 0;
    const totalItemPrice = (item.price + complementPrice) * quantity;
    
    setLastAddedItem({
      name: item.name,
      translations: item.translations,
      quantity,
      price: item.price + complementPrice,
      totalPrice: totalItemPrice,
    });
    
    setItems((prev) => {
      // Only merge with a non-deferred entry of the same product.
      // If the existing entry is deferred, add a separate non-deferred entry instead.
      const existingIndex = prev.findIndex((ci) =>
        getItemKey(ci.item, ci.selectedComplements) === itemKey && !ci.deferred
      );
      if (existingIndex >= 0) {
        return prev.map((ci, index) =>
          index === existingIndex ? { ...ci, quantity: ci.quantity + quantity } : ci
        )
      }
      return [...prev, { cartId: newCartId(), item, quantity, selectedComplements, justAdded: true, deferred: deferred ?? undefined }]
    })
  }, [])

  const removeItem = useCallback((cartId: string) => {
    setLastAddedItem(null);
    setItems((prev) => {
      const next = prev.map(ci => ci.cartId === cartId ? { ...ci, justRemoved: true } : ci);
      setTimeout(() => {
        setItems(prev => prev.filter(ci => ci.cartId !== cartId));
      }, 200);
      return next;
    })
  }, [])

  const updateQuantity = useCallback((cartId: string, quantity: number) => {
    setLastAddedItem(null);
    if (quantity <= 0) {
      setItems((prev) => {
        const next = prev.map(ci => ci.cartId === cartId ? { ...ci, justRemoved: true } : ci);
        setTimeout(() => {
          setItems(prev => prev.filter(ci => ci.cartId !== cartId));
        }, 200);
        return next;
      })
    } else {
      setItems((prev) => prev.map(ci => ci.cartId === cartId ? { ...ci, quantity, justAdded: false } : ci))
    }
  }, [])

  const clearCart = useCallback(() => { setItems([]); setLastAddedItem(null); }, [])

  const clearNonDeferred = useCallback(() => {
    setLastAddedItem(null);
    // Keep only items explicitly marked deferred.
    setItems(prev => prev.filter(ci => ci.deferred));
  }, [])

  const toggleDeferred = useCallback((cartId: string) => {
    setItems(prev => prev.map(ci => ci.cartId === cartId ? { ...ci, deferred: !ci.deferred } : ci));
  }, [])

  const releaseAllDeferred = useCallback(() => {
    setItems(prev => prev.map(ci => ci.deferred ? { ...ci, deferred: false } : ci));
  }, [])

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
    clearNonDeferred,
    toggleDeferred,
    releaseAllDeferred,
    totalItems,
    totalPrice,
    isCartOpen,
    openCart,
    closeCart,
    lastAddedItem,
  }), [items, addItem, removeItem, updateQuantity, clearCart, clearNonDeferred, toggleDeferred, releaseAllDeferred, totalItems, totalPrice, isCartOpen, openCart, closeCart, lastAddedItem]);

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
