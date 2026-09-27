"use client";

import { useEffect, useRef, useState } from "react";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";
import { useCart } from "@/lib/cart-context";
import {
  claveCarritoGuardado,
  debePersistirCarrito,
  restaurarCarrito,
  serializarCarrito,
} from "@/lib/carrito-guardado";

/**
 * Recuerda el carrito de la tienda publica entre visitas (localStorage, 7
 * dias). Se monta en la carta y no en el CartProvider: el provider vive en el
 * root layout y lo comparten el camarero y el comensal en mesa, donde el
 * carrito NO debe sobrevivir a una recarga.
 *
 * localStorage puede lanzar (modo privado, cuota, bloqueado): todo va en
 * try/catch y el carrito sigue funcionando en memoria.
 */
export function useCarritoGuardado(opts: Readonly<{
  empresaId: string | undefined;
  productos: readonly MenuItemVM[];
  showCart: boolean;
  isWaiterMode: boolean;
  esRestaurante: boolean;
  mesaId: string | null;
}>): void {
  const { empresaId, productos, showCart, isWaiterMode, esRestaurante, mesaId } = opts;
  const { items, restaurarItems } = useCart();
  const [activo, setActivo] = useState(false);
  const restauradoRef = useRef(false);

  useEffect(() => {
    const aplica = !!empresaId && debePersistirCarrito({
      showCart, isWaiterMode, esRestaurante, mesaId, search: globalThis.location.search,
    });
    if (!aplica) {
      setActivo(false);
      return;
    }
    if (!restauradoRef.current) {
      restauradoRef.current = true;
      try {
        const raw = globalThis.localStorage.getItem(claveCarritoGuardado(empresaId));
        restaurarItems(restaurarCarrito(raw, productos, Date.now()));
      } catch {
        // sin almacenamiento: carrito solo en memoria
      }
    }
    setActivo(true);
  }, [empresaId, productos, showCart, isWaiterMode, esRestaurante, mesaId, restaurarItems]);

  // Corre en el render SIGUIENTE a la restauracion (activo pasa a true a la
  // vez que llegan los items restaurados), asi que nunca guarda el vacio
  // inicial encima de lo guardado.
  useEffect(() => {
    if (!activo || !empresaId) return;
    const clave = claveCarritoGuardado(empresaId);
    try {
      if (items.some((ci) => !ci.justRemoved)) {
        globalThis.localStorage.setItem(clave, serializarCarrito(items, Date.now()));
      } else {
        globalThis.localStorage.removeItem(clave);
      }
    } catch {
      // sin almacenamiento: carrito solo en memoria
    }
  }, [activo, empresaId, items]);
}
