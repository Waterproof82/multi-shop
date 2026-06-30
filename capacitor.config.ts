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
};

export default config;
