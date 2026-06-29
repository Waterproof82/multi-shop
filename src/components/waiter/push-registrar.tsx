'use client';

import { useEffect } from 'react';

// Registers FCM push token AFTER waiter PIN login (waiter-auth-changed event).
//
// Foreground suppression: notification-type FCM messages in foreground are
// delivered to pushNotificationReceived — we do nothing (no-op) because
// Realtime WebSocket already plays the sound/UI update.
// Background / screen-off: Android FCM system shows the notification automatically.
export function PushRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function registerPush() {
      // Give the Capacitor bridge time to inject into the remote WebView
      await new Promise(resolve => setTimeout(resolve, 300));

      const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (!cap?.isNativePlatform?.()) return;

      try {
        const [{ PushNotifications }, { Preferences }] = await Promise.all([
          import('@capacitor/push-notifications'),
          import('@capacitor/preferences'),
        ]);

        // Request permission (dialog shows here, right after login)
        const { receive: permStatus } = await PushNotifications.checkPermissions();
        const granted =
          permStatus === 'granted'
            ? 'granted'
            : (await PushNotifications.requestPermissions()).receive;

        if (granted !== 'granted') return;

        // Foreground suppression: when app is open, Realtime already handles sound/UI
        await PushNotifications.addListener('pushNotificationReceived', () => {
          /* intentional no-op */
        });

        // On FCM token received, register with backend
        await PushNotifications.addListener('registration', async ({ value: fcmToken }) => {
          const { value: role } = await Preferences.get({ key: 'role' });
          if (role !== 'waiter' && role !== 'kitchen') return;

          await fetch('/api/waiter/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ fcm_token: fcmToken, role }),
          }).catch(() => { /* non-fatal */ });
        });

        await PushNotifications.register();
      } catch {
        // Capacitor not available in this environment — no-op
      }
    }

    // Trigger on login (PIN entered successfully)
    function onAuthChanged() {
      void registerPush();
    }

    window.addEventListener('waiter-auth-changed', onAuthChanged);
    return () => window.removeEventListener('waiter-auth-changed', onAuthChanged);
  }, []);

  return null;
}
