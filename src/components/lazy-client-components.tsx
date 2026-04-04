'use client';

// Wrapper for lazy loading client-only components in the root layout
import dynamic from 'next/dynamic';

export const LazyPromoToast = dynamic(
  () => import('./promo-toast').then(mod => ({ default: mod.PromoToast })),
  { ssr: false, loading: () => null }
);

export const LazyTgtgReservaPopup = dynamic(
  () => import('./tgtg-reserva-popup').then(mod => ({ default: mod.TgtgReservaPopup })),
  { ssr: false, loading: () => null }
);
