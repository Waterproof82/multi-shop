"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { getTrackingTokens } from "@/lib/order-tracking";

export function ActiveOrderBanner() {
  const [tokens, setTokens] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    setTokens(getTrackingTokens());
  }, []);

  if (tokens.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-primary text-primary-foreground px-4 py-3 shadow-lg">
        <span className="text-sm font-medium">
          {tokens.length === 1 ? '¿Tienes un pedido en curso?' : `Tienes ${tokens.length} pedidos en curso`}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/tracking/${tokens[0]}`)}
            className="text-sm font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Ver seguimiento
          </button>
          <button
            onClick={() => setTokens([])}
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
