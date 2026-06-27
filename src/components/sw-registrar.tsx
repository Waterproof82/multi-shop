'use client';

import { useEffect } from 'react';

export function SwRegistrar() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/waiter' })
      .catch(() => {
        // Fallo silencioso — el SW es una mejora progresiva.
        // La app funciona sin él; solo pierde la resiliencia offline.
      });
  }, []);

  return null;
}
