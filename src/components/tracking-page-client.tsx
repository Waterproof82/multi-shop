"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock, CheckCircle, AlertCircle, PartyPopper } from "lucide-react";

interface OrderStatus {
  numero_pedido: number;
  estimated_minutes: number | null;
  estimated_ready_at: string | null;
}

interface TrackingPageClientProps {
  token: string;
  initialStatus: OrderStatus | null;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' h';
}

function isReady(estimated_ready_at: string | null): boolean {
  if (!estimated_ready_at) return false;
  return new Date(estimated_ready_at) <= new Date();
}

export function TrackingPageClient({ token, initialStatus }: TrackingPageClientProps) {
  const [status, setStatus] = useState<OrderStatus | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/status?token=${token}`);
      if (res.status === 404) {
        setError('Pedido no encontrado.');
        return;
      }
      if (!res.ok) return;
      const data: OrderStatus = await res.json();
      setStatus(data);
    } catch {
      // Network error — keep showing last known status
    }
  }, [token]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus();
      setNow(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">Cargando estado del pedido...</p>
      </div>
    );
  }

  const ready = isReady(status.estimated_ready_at);
  // Suppress unused variable warning — now is used to trigger re-render on tick
  void now;

  if (ready) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <PartyPopper className="w-16 h-16 text-primary" />
        <div>
          <p className="text-2xl font-bold text-foreground">¡Tu pedido está listo!</p>
          <p className="text-muted-foreground mt-1">Pedido #{status.numero_pedido}</p>
        </div>
        <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
          <p className="text-secondary-foreground">Ya podés pasar a recogerlo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <CheckCircle className="w-16 h-16 text-green-500" />

      <div>
        <p className="text-2xl font-bold text-foreground">Tu pedido está en preparación</p>
        <p className="text-muted-foreground mt-1">Pedido #{status.numero_pedido}</p>
      </div>

      {status.estimated_minutes === null ? (
        <div className="rounded-xl bg-secondary px-6 py-4 max-w-sm">
          <p className="text-secondary-foreground">
            Tu pedido ha sido recibido. En breve recibirás el tiempo estimado de recogida.
          </p>
        </div>
      ) : (
        <div className="rounded-xl bg-secondary px-6 py-5 max-w-sm space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            <span className="text-lg font-semibold text-foreground">
              Tiempo estimado: {status.estimated_minutes} minutos
            </span>
          </div>
          {status.estimated_ready_at && (
            <p className="text-muted-foreground">
              Listo aproximadamente a las{' '}
              <span className="font-semibold text-foreground">
                {formatTime(status.estimated_ready_at)}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
