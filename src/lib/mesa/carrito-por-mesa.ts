"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart-context";

// El "último mesaId visto" vive a scope de módulo, no en un ref del
// componente: la página de mesa se desmonta al volver al grid, pero el
// CartProvider (root layout) sigue vivo — necesitamos recordar la mesa
// anterior más allá de la vida de esa página para detectar el cambio real.
let ultimaMesaVista: string | null = null;

/**
 * Gate de montaje para la página de comanda: al cambiar de mesa, vacía el
 * carrito ANTES de dejar pasar (evita que items de una mesa se filtren a
 * otra — clase de bug de facturación). Volver a la misma mesa no toca nada.
 */
export function useCarritoPorMesa(mesaId: string | null): boolean {
  const { clearCart } = useCart();
  const [listo, setListo] = useState(false);
  const clearCartRef = useRef(clearCart);
  clearCartRef.current = clearCart;

  useEffect(() => {
    if (!mesaId) return;
    if (ultimaMesaVista !== null && ultimaMesaVista !== mesaId) {
      clearCartRef.current();
    }
    ultimaMesaVista = mesaId;
    setListo(true);
  }, [mesaId]);

  return listo;
}
