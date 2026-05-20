"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export function ActiveOrderBanner() {
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem('last_order_tracking');
    if (saved) setToken(saved);
  }, []);

  if (!token) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-primary text-primary-foreground px-4 py-3 shadow-lg">
        <span className="text-sm font-medium">¿Tienes un pedido en curso?</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/tracking/${token}`)}
            className="text-sm font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Ver seguimiento
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('last_order_tracking');
              setToken(null);
            }}
            aria-label="Cerrar"
            className="hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
