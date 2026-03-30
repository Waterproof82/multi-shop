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

const SCROLL_OFFSET_PX = 140;

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
      const top = firstSection.getBoundingClientRect().top + globalThis.scrollY - SCROLL_OFFSET_PX;
      globalThis.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <button type="button" onClick={scrollToFirstCategory} className="flex items-center gap-2 cursor-pointer hover:scale-105 motion-reduce:hover:scale-100 transition-transform duration-200" aria-label={t("scrollToMenu", language)}>
          {logoUrl && (
            <div className="relative h-12 w-24 md:h-16 md:w-32 transition-transform duration-200 hover:scale-105 motion-reduce:hover:scale-100">
              <Image
                src={logoUrl}
                alt={empresa?.nombre ?? t("companyLogo", language)}
                fill
                className="object-contain"
                loading="eager"
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
              className="relative min-h-[44px] min-w-[44px] hover:bg-muted/50 hover:scale-105 motion-reduce:hover:scale-100 transition-all duration-200"
              onClick={handleOpenCart}
              aria-label={t("openCart", language)}
            >
              <ShoppingCart className="size-5 transition-transform duration-200 hover:scale-110" />
              {totalItems > 0 && (
                <span
                  key={totalItems}
                  className={`absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground ${animate ? 'animate-badge-pop motion-reduce:animate-none' : ''} hover:scale-110 motion-reduce:hover:scale-100 transition-transform duration-200`}
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
