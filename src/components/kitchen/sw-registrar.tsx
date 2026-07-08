'use client';

import { useEffect } from 'react';

export function KitchenSwRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register('/sw-kitchen.js', { scope: '/kitchen' })
      .catch(() => {
        // Fallo silencioso — el SW es una mejora progresiva.
        // La cocina funciona sin él; solo pierde resiliencia offline.
      });
  }, []);

  return null;
}
