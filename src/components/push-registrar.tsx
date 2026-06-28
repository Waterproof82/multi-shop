'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform: () => boolean;
      Plugins: {
        PushNotifications?: {
          requestPermissions: () => Promise<{ receive: string }>;
          register: () => Promise<void>;
          addListener: (event: string, callback: (token: { value: string }) => void) => void;
        };
        Preferences?: {
          get: (opts: { key: string }) => Promise<{ value: string | null }>;
        };
      };
    };
  }
}

interface PushRegistrarProps {
  role: 'waiter' | 'kitchen';
}

export function PushRegistrar({ role }: Readonly<PushRegistrarProps>) {
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return;

    const push = window.Capacitor.Plugins.PushNotifications;
    if (!push) return;

    async function register() {
      const permission = await push!.requestPermissions();
      if (permission.receive !== 'granted') return;

      push!.addListener('registration', async (token) => {
        try {
          // empresa_id comes from x-empresa-id header (injected by proxy from JWT)
          await fetch('/api/waiter/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fcm_token: token.value, role }),
          });
        } catch {
          // Non-critical — push registration failure doesn't break the app
        }
      });

      await push!.register();
    }

    register().catch(() => {
      // Silently ignore — native push setup failure is non-critical
    });
  }, [role]);

  return null;
}
