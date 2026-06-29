'use client';

import { useEffect } from 'react';

// Registers FCM push token AFTER waiter PIN login (waiter-auth-changed event).
//
// Foreground suppression: notification-type FCM messages in foreground are
// delivered to pushNotificationReceived — we do nothing (no-op) because
// Realtime WebSocket already plays the sound/UI update.
// Background / screen-off: Android FCM system shows the notification automatically.

type PushPlugin = {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  addListener(event: string, callback: (data: { value: string }) => void | Promise<void>): Promise<unknown>;
  register(): Promise<void>;
};
type PrefsPlugin = {
  get(opts: { key: string }): Promise<{ value: string | null }>;
};

async function sendToken(fcmToken: string, Preferences: PrefsPlugin): Promise<void> {
  const { value: role } = await Preferences.get({ key: 'role' });
  if (role !== 'waiter' && role !== 'kitchen') return;
  await fetch('/api/waiter/device-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ fcm_token: fcmToken, role }),
  }).catch(() => { /* non-fatal */ });
}

async function registerPush(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 300));

  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (!cap?.isNativePlatform?.()) return;

  try {
    const [{ PushNotifications }, { Preferences }] = await Promise.all([
      // @ts-expect-error — module only available in Capacitor Android environment
      import('@capacitor/push-notifications') as Promise<{ PushNotifications: PushPlugin }>,
      // @ts-expect-error — module only available in Capacitor Android environment
      import('@capacitor/preferences') as Promise<{ Preferences: PrefsPlugin }>,
    ]);

    const { receive: permStatus } = await PushNotifications.checkPermissions();
    const granted =
      permStatus === 'granted'
        ? 'granted'
        : (await PushNotifications.requestPermissions()).receive;

    if (granted !== 'granted') return;

    await PushNotifications.addListener('pushNotificationReceived', () => { /* no-op: Realtime handles foreground */ });
    await PushNotifications.addListener('registration', ({ value: fcmToken }) => sendToken(fcmToken, Preferences));
    await PushNotifications.register();
  } catch {
    // Capacitor not available in this environment — no-op
  }
}

export function PushRegistrar() {
  useEffect(() => {
    function onAuthChanged() { void registerPush(); }
    globalThis.window?.addEventListener('waiter-auth-changed', onAuthChanged);
    return () => globalThis.window?.removeEventListener('waiter-auth-changed', onAuthChanged);
  }, []);

  return null;
}
