"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChefHat } from "lucide-react";
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
      <div
        className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-xl cursor-pointer active:scale-95 transition-transform"
        style={{ backgroundColor: '#f97316', color: '#fff' }}
        onClick={() => router.push(`/tracking/${tokens[0]}`)}
        role="button"
        aria-label="Ver seguimiento del pedido"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 shrink-0">
          <ChefHat className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">
            {tokens.length === 1 ? '¡Tenés un pedido en curso!' : `¡Tenés ${tokens.length} pedidos en curso!`}
          </p>
          <p className="text-xs opacity-90 mt-0.5">Tocá para ver el seguimiento</p>
        </div>
      </div>
    </div>
  );
}
