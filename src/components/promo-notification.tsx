"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const MESSAGES: Record<string, { text: string; type: "success" | "error" }> = {
  "promo=on": { text: "Te has dado de alta en las promociones.", type: "success" },
  "promo=off": { text: "Te has dado de baja de las promociones.", type: "success" },
  "error=invalid": { text: "Enlace no válido.", type: "error" },
  "error=notfound": { text: "No se encontró el registro.", type: "error" },
  "error=internal": { text: "Ocurrió un error. Inténtalo más tarde.", type: "error" },
};

function PromoNotificationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const promo = searchParams.get("promo");
    const error = searchParams.get("error");

    let key: string | null = null;
    if (promo) key = `promo=${promo}`;
    else if (error) key = `error=${error}`;

    if (key && MESSAGES[key]) {
      setNotification(MESSAGES[key]);

      // Clean URL without reloading
      const url = new URL(globalThis.location.href);
      url.searchParams.delete("promo");
      url.searchParams.delete("error");
      router.replace(url.pathname, { scroll: false });

      const timer = setTimeout(() => setNotification(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, router]);

  if (!notification) return null;

  const isSuccess = notification.type === "success";
  const colorClasses = isSuccess
    ? "bg-primary text-primary-foreground"
    : "bg-destructive text-destructive-foreground";

  return (
    <div className={`fixed top-20 left-1/2 z-[100] -translate-x-1/2 ${colorClasses} px-6 py-3 rounded-lg shadow-elegant-lg text-sm font-medium max-w-md text-center`}>
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
