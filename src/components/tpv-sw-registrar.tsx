'use client';
import { useEffect } from 'react';

export function TpvSwRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          return Promise.all(
            registrations
              .filter((registration) => registration.scope.includes('/tpv'))
              .map((registration) => registration.unregister())
          );
        })
        .catch(() => {
          // Ignore cleanup failures in dev.
        });
      return;
    }

    void navigator.serviceWorker.register('/sw-tpv.js', { scope: '/tpv' });
  }, []);
  return null;
}
