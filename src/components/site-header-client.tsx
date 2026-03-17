"use client";

import { ShoppingCart } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { t } from "@/lib/translations";
import { useEffect, useState, useRef } from "react";
import { useCart } from "@/lib/cart-context";
import { useLanguage } from "@/lib/language-context";
import type { EmpresaPublic } from "@/core/domain/entities/types";

interface SiteHeaderClientProps {
  readonly showCart: boolean;
  readonly empresa?: EmpresaPublic | null;
}

export function SiteHeaderClient({ showCart, empresa }: SiteHeaderClientProps) {
  const { openCart, totalItems } = useCart();
  const { language } = useLanguage();
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

  const scrollToFirstCategory = () => {
    const firstSection = document.querySelector("section[id]");
    if (firstSection) {
      const offset = 140;
      const top = firstSection.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <button type="button" onClick={scrollToFirstCategory} className="flex items-center gap-2 cursor-pointer" aria-label={t("scrollToMenu", language)}>
          {logoUrl && (
            <div className="relative h-12 w-24 md:h-16 md:w-32">
              <Image
                src={logoUrl}
                alt={empresa?.nombre ?? "Logo"}
                fill
                className="object-contain"
                loading="eager"
                unoptimized
              />
            </div>
          )}
        </button>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          {showCart ? (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={handleOpenCart}
              aria-label={t("openCart", language)}
            >
              <ShoppingCart className="size-5" />
              {totalItems > 0 && (
                <span
                  key={totalItems}
                  className={`absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground ${animate ? 'animate-badge-pop' : ''}`}
                >
                  {totalItems}
                </span>
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
