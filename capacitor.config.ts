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
      // Empty: foreground push notifications are suppressed (Realtime WebSocket handles
      // in-app updates). Background/closed: FCM system shows the notification via the
      // kitchen_alerts channel (IMPORTANCE_HIGH) created in MainActivity.
      presentationOptions: [],
    },
  },
};

export default config;
