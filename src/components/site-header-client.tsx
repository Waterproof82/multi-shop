"use client";

import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { t } from "@/lib/translations";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCart } from "@/lib/cart-context";

interface SiteHeaderClientProps {
  readonly showCart: boolean;
}

export function SiteHeaderClient({ showCart }: SiteHeaderClientProps) {
  const { openCart, totalItems } = useCart();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (totalItems > 0) {
      setAnimate(false);
      const timeout = setTimeout(() => setAnimate(true), 10);
      const timeout2 = setTimeout(() => setAnimate(false), 1000);
      return () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
      };
    }
  }, [totalItems]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    const fetchLogo = async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("logo_url")
        .limit(1)
        .single();
      if (!error && data?.logo_url) {
        setLogoUrl(data.logo_url);
      }
    };
    fetchLogo();
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
        <a href="/" className="flex items-center gap-2">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Mermelada de Tomate"
              className="h-12 w-auto md:h-16"
              loading="eager"
            />
          )}
        </a>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          {showCart ? (
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              onClick={openCart}
              aria-label={t("openCart", "es")}
            >
              <ShoppingCart className="size-5" />
              {totalItems > 0 && (
                <span
                  key={totalItems}
                  className={`absolute -top-2 -right-2 flex items-center justify-center rounded-full bg-red-600 text-white text-xs w-6 h-6 font-bold transition-transform ${animate ? 'animate-bounce-long' : ''}`}
                  style={{ pointerEvents: 'none' }}
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
