"use client";

import { ShoppingCart, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSelector } from "@/components/language-selector";
import { t } from "@/lib/translations";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCart } from "@/lib/cart-context";
import { checkCartAuthorization } from "@/app/actions";
import { useLanguage } from "@/lib/language-context";
import { useToast } from "@/hooks/use-toast";

interface SiteHeaderClientProps {
  readonly showCart: boolean;
  readonly tokenExpiresAt: number | null;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SiteHeaderClient({ showCart, tokenExpiresAt }: SiteHeaderClientProps) {
  const { openCart, totalItems } = useCart();
  const { language } = useLanguage();
  const { toast } = useToast();
  const [animate, setAnimate] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(showCart);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!tokenExpiresAt) {
      setTimeLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((tokenExpiresAt - now) / 1000));
      return remaining;
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setIsAuthorized(false);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [tokenExpiresAt]);

  const handleOpenCart = async () => {
    const authorized = await checkCartAuthorization();
    if (authorized) {
      setIsAuthorized(true);
      openCart();
    } else {
      setIsAuthorized(false);
      toast({
        variant: "destructive",
        title: t("sessionExpired", language),
      });
    }
  };

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
          {isAuthorized && timeLeft !== null && timeLeft > 0 && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${
              timeLeft <= 60 ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
            }`}>
              <Clock className="size-3" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          )}
          {isAuthorized ? (
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
