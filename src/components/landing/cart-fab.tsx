"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useLanguage } from "@/lib/language-context";
import { HREF_CARTA_CON_CARRITO, etiquetaAbrirCarrito } from "@/lib/cart-abrir-param";

// Link (navegacion en cliente) y no window.location: el carrito vive solo en
// memoria del CartProvider y una recarga completa lo vaciaria.
// rel="nofollow": `?carrito=abierto` es un estado de UI, no una pagina; su
// canonical ya es /carta y robots.ts lo excluye del rastreo.
export function CartFab() {
  const { totalItems } = useCart();
  const { language } = useLanguage();

  return (
    <Link
      href={HREF_CARTA_CON_CARRITO}
      rel="nofollow"
      aria-label={etiquetaAbrirCarrito(totalItems, language)}
      className="fixed bottom-[18px] right-[18px] z-40 inline-flex size-[52px] items-center justify-center rounded-full bg-foreground text-background ring-2 ring-background shadow-[0_10px_26px_-6px_color-mix(in_oklch,var(--foreground)_45%,transparent)] transition-transform duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95 motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-ring focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:size-14"
    >
      <ShoppingBag className="size-6" aria-hidden="true" />
      {totalItems > 0 && (
        <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground ring-2 ring-background">
          {totalItems}
        </span>
      )}
    </Link>
  );
}
