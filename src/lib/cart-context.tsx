"use client"

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react"
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model"
import { getItemKey } from "./cart-utils"

type PaseKey = 'primer' | 'segundo' | 'postre';

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
  note?: string
  justAdded?: boolean
  justRemoved?: boolean
  deferred?: boolean      // waiter marked this item to send later (comida only)
  pase?: PaseKey  // waiter: course assignment for this item
}

function newCartId(): string {
  // Use timestamp + cryptographic random for unique cart IDs
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return Date.now().toString(36) + randomPart;
}

// Extract predicate to reduce nesting depth (S2004)
function isNotTargetItem(targetCartId: string) {
  return (ci: CartItem) => ci.cartId !== targetCartId;
}

export interface AddedItemInfo {
  name: string;
  translations: MenuItemVM['translations'];
  quantity: number;
  price: number;
  totalPrice: number;
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: MenuItemVM, quantity?: number, selectedComplements?: Complement[], deferred?: boolean, note?: string, pase?: 'primer' | 'segundo' | 'postre') => void
  removeItem: (cartId: string) => void
  updateQuantity: (cartId: string, quantity: number) => void
  clearCart: () => void
  toggleDeferred: (cartId: string) => void
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

  const addItem = useCallback((item: MenuItemVM, quantity = 1, selectedComplements?: Complement[], deferred?: boolean, note?: string, pase?: 'primer' | 'segundo' | 'postre') => {
    const itemKey = getItemKey(item, selectedComplements, note, pase);
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
      // Only merge with a non-deferred entry of the same product + same pase.
      // If the existing entry is deferred, add a separate non-deferred entry instead.
      const existingIndex = prev.findIndex((ci) =>
        getItemKey(ci.item, ci.selectedComplements, ci.note, ci.pase) === itemKey && !ci.deferred
      );
      if (existingIndex >= 0) {
        return prev.map((ci, index) =>
          index === existingIndex ? { ...ci, quantity: ci.quantity + quantity } : ci
        )
      }
      return [...prev, { cartId: newCartId(), item, quantity, selectedComplements, note: note || undefined, justAdded: true, deferred: deferred ?? undefined, pase }]
    })
  }, [])

  const removeItemDelayed = useCallback((targetCartId: string) => {
    setTimeout(() => {
      setItems(prev => prev.filter(isNotTargetItem(targetCartId)));
    }, 200);
  }, []);

  const removeItem = useCallback((cartId: string) => {
    setLastAddedItem(null);
    setItems((prev) => {
      const next = prev.map(ci => ci.cartId === cartId ? { ...ci, justRemoved: true } : ci);
      removeItemDelayed(cartId);
      return next;
    })
  }, [removeItemDelayed])

  const updateQuantity = useCallback((cartId: string, quantity: number) => {
    setLastAddedItem(null);
    if (quantity <= 0) {
      setItems((prev) => {
        const next = prev.map(ci => ci.cartId === cartId ? { ...ci, justRemoved: true } : ci);
        removeItemDelayed(cartId);
        return next;
      })
    } else {
      setItems((prev) => prev.map(ci => ci.cartId === cartId ? { ...ci, quantity, justAdded: false } : ci))
    }
  }, [removeItemDelayed])

  const clearCart = useCallback(() => { setItems([]); setLastAddedItem(null); }, [])

  const toggleDeferred = useCallback((cartId: string) => {
    setItems(prev => prev.map(ci => ci.cartId === cartId ? { ...ci, deferred: !ci.deferred } : ci));
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
    toggleDeferred,
    totalItems,
    totalPrice,
    isCartOpen,
    openCart,
    closeCart,
    lastAddedItem,
  }), [items, addItem, removeItem, updateQuantity, clearCart, toggleDeferred, totalItems, totalPrice, isCartOpen, openCart, closeCart, lastAddedItem]);

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
