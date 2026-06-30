import type { Metadata } from 'next';
import { PushRegistrar } from '@/components/waiter/push-registrar';
import { KitchenSwRegistrar } from '@/components/kitchen/sw-registrar';
import { KitchenOfflineBanner } from '@/components/kitchen/offline-banner';
import { KitchenPinGate } from '@/components/kitchen/pin-gate';

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function KitchenLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <KitchenPinGate>
      <PushRegistrar />
      <KitchenSwRegistrar />
      <KitchenOfflineBanner />
      {children}
    </KitchenPinGate>
  );
}
