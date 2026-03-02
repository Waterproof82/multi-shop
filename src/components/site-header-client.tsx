"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { t } from "@/lib/translations";
import { useEffect, useState, useRef } from "react";
import { useCart } from "@/lib/cart-context";
import type { EmpresaInfo } from "@/lib/server-services";

interface SiteHeaderClientProps {
  readonly showCart: boolean;
  readonly empresa?: EmpresaInfo | null;
}

export function SiteHeaderClient({ showCart, empresa }: SiteHeaderClientProps) {
  const { openCart, totalItems } = useCart();
  const [animate, setAnimate] = useState(false);

  const handleOpenCart = () => {
    openCart();
  };
 
  const prevTotalItemsRef = useRef(totalItems);

  useEffect(() => {
    if (prevTotalItemsRef.current !== totalItems && totalItems > 0) {
      setAnimate(false);
      const timeout = setTimeout(() => setAnimate(true), 10);
      const timeout2 = setTimeout(() => setAnimate(false), 1000);
      return () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
      };
    }
    prevTotalItemsRef.current = totalItems;
  }, [totalItems]);

  const logoUrl = empresa?.logoUrl ?? null;

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          {logoUrl && (
            <Image
              src={logoUrl}
              alt="Mermelada de Tomate"
              width={100}
              height={64}
              className="h-12 w-auto md:h-16"
              loading="eager"
              unoptimized
            />
          )}
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          {showCart ? (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={handleOpenCart}
              aria-label={t("openCart", "es")}
            >
              <ShoppingCart className="size-5" />
              {totalItems > 0 && (
                <span
                  key={totalItems}
                  className={`absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white ${animate ? 'animate-bounce-long' : ''}`}
                >
                  {totalItems}
                </span>
              )}
            </Button>
          ) : (
            <div className="text-gray-400 text-sm"></div>
          )}
        </div>
      </div>
    </header>
  );
}
