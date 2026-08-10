import type { Metadata } from 'next';
import { OfflineBanner } from '@/components/waiter/offline-banner';
import { PushRegistrar } from '@/components/waiter/push-registrar';
import { WaiterCatalogProvider } from '@/lib/waiter-catalog-ctx';

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function WaiterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <WaiterCatalogProvider>
      <PushRegistrar />
      <OfflineBanner />
      {children}
    </WaiterCatalogProvider>
  );
}
