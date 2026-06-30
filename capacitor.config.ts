import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.multishop.waiter',
  appName: 'Waiter',
  webDir: 'www',
  // No server.url — WebView starts from www/index.html (local).
  // After setup, www/index.html navigates to the tenant's remote URL.
  server: {
    // Allow any HTTPS domain — required for multi-tenant (each customer has their own domain)
    allowNavigation: ['*'],
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    useLegacyBridge: false, // Routes fetch() through native HTTP — bypasses WebView CORS
  },
  plugins: {
    PushNotifications: {
      // Show system notification even when app is in foreground (kitchen always-on display).
      // Without this, foreground messages only fire pushNotificationReceived JS event,
      // which is unreachable on external URLs (window.Capacitor undefined).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
