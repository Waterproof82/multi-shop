import type { Metadata } from 'next';

export const metadata: Metadata = {
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export default function WaiterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
