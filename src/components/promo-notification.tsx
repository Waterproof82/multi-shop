"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";

type TranslationKey = Parameters<typeof t>[0];

const MESSAGE_KEYS: Record<string, { key: TranslationKey; type: "success" | "error" }> = {
  "promo=on": { key: "promoSubscribed", type: "success" },
  "promo=off": { key: "promoUnsubscribed", type: "success" },
  "error=invalid": { key: "promoErrorInvalid", type: "error" },
  "error=notfound": { key: "promoErrorNotFound", type: "error" },
  "error=internal": { key: "promoErrorInternal", type: "error" },
};

function PromoNotificationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { language } = useLanguage();
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const promo = searchParams.get("promo");
    const error = searchParams.get("error");

    let key: string | null = null;
    if (promo) key = `promo=${promo}`;
    else if (error) key = `error=${error}`;

    const msgConfig = key ? MESSAGE_KEYS[key] : undefined;
    if (msgConfig) {
      setNotification({ text: t(msgConfig.key, language), type: msgConfig.type });

      // Clean URL without reloading
      const url = new URL(globalThis.location.href);
      url.searchParams.delete("promo");
      url.searchParams.delete("error");
      router.replace(url.pathname, { scroll: false });

      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router, language]);

  if (!notification) return null;

  const isSuccess = notification.type === "success";
  const colorClasses = isSuccess
    ? "bg-primary text-primary-foreground"
    : "bg-destructive text-destructive-foreground";

  return (
    <div 
      role="alert" 
      aria-live={notification.type === "error" ? "assertive" : "polite"}
      className={`fixed top-20 left-1/2 z-[100] -translate-x-1/2 ${colorClasses} px-6 py-3 rounded-lg shadow-elegant-lg text-sm font-medium max-w-md text-center`}
    >
      {notification.text}
    </div>
  );
}

export function PromoNotification() {
  return (
    <Suspense fallback={null}>
      <PromoNotificationInner />
    </Suspense>
  );
}
