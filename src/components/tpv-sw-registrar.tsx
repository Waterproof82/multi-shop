'use client';
import { useEffect } from 'react';

export function TpvSwRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw-tpv.js', { scope: '/tpv' });
  }, []);
  return null;
}
