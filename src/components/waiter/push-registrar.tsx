'use client';

import { useEffect } from 'react';

// Registers FCM token for push notifications when running inside Capacitor.
// Foreground suppression: notification-type FCM messages are NOT shown by
// Android automatically in foreground — they arrive here via pushNotificationReceived.
// We deliberately do nothing with them because Realtime already handles the sound/UI.
// Background / screen-off: Android system shows the notification automatically.
export function PushRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Only run inside the Capacitor native shell
    if (!window.Capacitor?.isNativePlatform()) return;

    let cleanupFns: Array<() => void> = [];

    async function init() {
      const [{ PushNotifications }, { Preferences }] = await Promise.all([
        import('@capacitor/push-notifications'),
        import('@capacitor/preferences'),
      ]);

      const { receive: permStatus } = await PushNotifications.checkPermissions();
      const granted =
        permStatus === 'granted'
          ? 'granted'
          : (await PushNotifications.requestPermissions()).receive;

      if (granted !== 'granted') return;

      // Foreground suppression — do nothing when the app is open
      const fgListener = await PushNotifications.addListener(
        'pushNotificationReceived',
        () => { /* intentional no-op: Realtime WebSocket already notified */ }
      );
      cleanupFns.push(() => fgListener.remove());

      const regListener = await PushNotifications.addListener(
        'registration',
        async ({ value: fcmToken }) => {
          const { value: role } = await Preferences.get({ key: 'role' });
          if (!role || (role !== 'waiter' && role !== 'kitchen')) return;

          await fetch('/api/waiter/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ fcm_token: fcmToken, role }),
          }).catch(() => { /* non-fatal */ });
        }
      );
      cleanupFns.push(() => regListener.remove());

      await PushNotifications.register();
    }

    init().catch(() => { /* non-fatal: push not available in this environment */ });

    return () => {
      cleanupFns.forEach(fn => fn());
    };
  }, []);

  return null;
}
