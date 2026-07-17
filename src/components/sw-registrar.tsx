'use client';

import { useEffect } from 'react';

export function SwRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          return Promise.all(
            registrations
              .filter((registration) => registration.scope.includes('/waiter'))
              .map((registration) => registration.unregister())
          );
        })
        .catch(() => {
          // Ignore cleanup failures in dev.
        });
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
