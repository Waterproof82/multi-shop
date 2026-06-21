"use client";

import { ShoppingCart, BellRing } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { t } from "@/lib/translations";
import { useEffect, useState, useRef } from "react";
import { useCart } from "@/lib/cart-context";
import { useLanguage } from "@/lib/language-context";
import { getWaiterMesa } from "@/components/waiter-login-form";
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
  const [waiterActive, setWaiterActive] = useState(false);
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [calling, setCalling] = useState(false);
  const [called, setCalled] = useState(false);

  useEffect(() => {
    setWaiterActive(!!getWaiterMesa());
    const mesa = new URLSearchParams(window.location.search).get('mesa');
    setMesaId(mesa);
  }, []);

  const handleCallWaiter = async () => {
    if (!mesaId || calling || called) return;
    setCalling(true);
    try {
      await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/call-waiter`, { method: 'POST' });
      setCalled(true);
      setTimeout(() => setCalled(false), 30000);
    } finally {
      setCalling(false);
    }
  };

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
    <>
      {called && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 rounded-full px-5 py-2.5 shadow-lg pointer-events-none"
          style={{ background: 'oklch(20% 0.05 252 / 0.92)', border: '1px solid oklch(40% 0.10 252 / 0.5)', backdropFilter: 'blur(8px)' }}
        >
          <BellRing className="w-4 h-4 shrink-0" style={{ color: 'oklch(80% 0.18 55)' }} />
          <span className="text-sm font-medium" style={{ color: 'oklch(92% 0.03 252)' }}>
            Camarero avisado
          </span>
        </div>
      )}
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <button type="button" onClick={scrollToFirstCategory} className="flex items-center gap-2 cursor-pointer hover:scale-105 motion-reduce:hover:scale-100 transition-transform duration-200" aria-label={t("scrollToMenu", language)}>
          {logoUrl && (
            <div className="relative h-12 w-24 md:h-16 md:w-32 transition-transform duration-200 hover:scale-105 motion-reduce:hover:scale-100">
              <Image
                src={logoUrl}
                alt={empresa?.nombre ?? t("companyLogo", language)}
                fill
                sizes="(max-width: 768px) 96px, 128px"
                className="object-contain"
                loading="eager"
              />
            </div>
          )}
        </button>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          {showCart && !waiterActive && mesaId && (
            <Button
              variant="ghost"
              size="icon"
              className="relative min-h-[44px] min-w-[44px] transition-all duration-200"
              onClick={() => { void handleCallWaiter(); }}
              disabled={calling || called}
              aria-label="Llamar al camarero"
              style={called ? { color: 'var(--color-primary)', opacity: 0.7 } : undefined}
            >
              <BellRing className={`size-5 ${called ? 'animate-pulse' : ''}`} />
            </Button>
          )}
          {showCart && !waiterActive ? (
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
    </>
  );
}
