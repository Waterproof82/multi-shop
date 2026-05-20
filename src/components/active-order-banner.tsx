"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat } from "lucide-react";
import { getTrackingTokens, removeTrackingToken, isOrderExpired } from "@/lib/order-tracking";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

export function ActiveOrderBanner() {
  const [tokens, setTokens] = useState<string[]>([]);
  const router = useRouter();
  const { language } = useLanguage();

  useEffect(() => {
    const stored = getTrackingTokens();
    if (stored.length === 0) return;

    Promise.all(
      stored.map(async (token) => {
        try {
          const res = await fetch(`/api/orders/status?token=${token}`);
          if (res.status === 404) { removeTrackingToken(token); return null; }
          if (!res.ok) return token;
          const data = await res.json();
          if (isOrderExpired(data.estimated_ready_at)) {
            removeTrackingToken(token);
            return null;
          }
          return token;
        } catch {
          return token;
        }
      })
    ).then((results) => {
      setTokens(results.filter((t): t is string => t !== null));
    });
  }, []);

  if (tokens.length === 0) return null;

  const bannerText = tokens.length === 1
    ? t('bannerSingular', language)
    : t('bannerPlural', language).replace('{count}', String(tokens.length));

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl cursor-pointer active:scale-95 transition-transform"
        style={{ backgroundColor: '#f97316', color: '#fff' }}
        onClick={() => router.push(`/tracking/${tokens[0]}`)}
        role="button"
        aria-label={t('bannerCta', language)}
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 shrink-0">
          <ChefHat className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">{bannerText}</p>
          <p className="text-xs opacity-90 mt-0.5">{t('bannerCta', language)}</p>
        </div>
      </div>
    </div>
  );
}
