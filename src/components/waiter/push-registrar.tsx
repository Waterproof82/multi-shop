'use client';

import { useEffect } from 'react';
import type { PushNotificationsPlugin } from '@capacitor/push-notifications';
import type { PreferencesPlugin } from '@capacitor/preferences';

// Registers FCM push token AFTER waiter PIN login (waiter-auth-changed event).
//
// Foreground suppression: notification-type FCM messages in foreground are
// delivered to pushNotificationReceived — we do nothing (no-op) because
// Realtime WebSocket already plays the sound/UI update.
// Background / screen-off: Android FCM system shows the notification automatically.

async function sendToken(fcmToken: string, Preferences: PreferencesPlugin): Promise<void> {
  const { value: role } = await Preferences.get({ key: 'role' });
  if (role !== 'waiter' && role !== 'kitchen') return;
  await fetch('/api/waiter/device-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ fcm_token: fcmToken, role }),
  }).catch(() => { /* non-fatal */ });
}

let listenersRegistered = false;

async function registerPush(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 300));

  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  try {
    const [{ PushNotifications }, { Preferences }] = await Promise.all([
      import('@capacitor/push-notifications') as Promise<{ PushNotifications: PushNotificationsPlugin }>,
      import('@capacitor/preferences') as Promise<{ Preferences: PreferencesPlugin }>,
    ]);

    const { receive: permStatus } = await PushNotifications.checkPermissions();
    const granted =
      permStatus === 'granted'
        ? 'granted'
        : (await PushNotifications.requestPermissions()).receive;

    if (granted !== 'granted') return;

    if (!listenersRegistered) {
      await PushNotifications.addListener('pushNotificationReceived', () => { /* no-op: Realtime handles foreground */ });
      await PushNotifications.addListener('registration', ({ value: fcmToken }) => sendToken(fcmToken, Preferences));
      await PushNotifications.addListener('pushNotificationActionPerformed', (_action) => {
        // DEBUG: hardcoded navigation to confirm the event fires at all.
        // If this works, the issue was data extraction. If it still goes to /waiter, event is not firing.
        globalThis.location.href = '/waiter/pendientes';
      });
      listenersRegistered = true;
    }

    // Always call register() — re-fires 'registration' event → sendToken() with the current role
    await PushNotifications.register();

    // If native code saved a pending route (cold-start), read and consume it
    try {
      const { value: pendingRoute } = await Preferences.get({ key: 'push_route' });
      if (pendingRoute) {
        try { await Preferences.remove({ key: 'push_route' }); } catch {}
        // Navigate to the saved route (it may be an absolute URL or app path)
        globalThis.location.href = pendingRoute;
      }
    } catch {
      // ignore if Preferences isn't available or remove fails
    }
  } catch {
    // Capacitor not available in this environment — no-op
  }
}

export function PushRegistrar() {
  useEffect(() => {
    void registerPush(); // register immediately — handles already-authenticated users and cold-start notification taps
    function onAuthChanged() { void registerPush(); }
    globalThis.window?.addEventListener('waiter-auth-changed', onAuthChanged);
    return () => globalThis.window?.removeEventListener('waiter-auth-changed', onAuthChanged);
  }, []);

  return null;
}
