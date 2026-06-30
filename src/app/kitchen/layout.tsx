import type { Metadata } from 'next';
import { PushRegistrar } from '@/components/waiter/push-registrar';

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function KitchenLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <PushRegistrar />
      {children}
    </>
  );
}
