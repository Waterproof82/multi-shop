import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.multishop.waiter',
  appName: 'Waiter',
  webDir: 'www',
  // No server.url — WebView starts from www/index.html (local).
  // After setup, www/index.html navigates to the tenant's remote URL.
  server: {
    allowNavigation: [
      '*.tusaas.com',          // SaaS subdomains — replace with actual domain
      '*.dominiocliente.com',  // Custom tenant domains — add as needed
    ],
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    useLegacyBridge: false, // Routes fetch() through native HTTP — bypasses WebView CORS
  },
};

export default config;
