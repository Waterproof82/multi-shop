/** @type {import('next').NextConfig} */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

// Bundle analyzer - only run when ANALYZE=true
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? (await import('@next/bundle-analyzer')).default
  : (config) => config;

// Build CSP fallback for static assets (pages get a nonce-based CSP from middleware)
function normalizeR2Origin(raw) {
  if (!raw) return '';
  const stripped = raw.replace(/^https?:\/\//, '');
  return `https://${stripped}`;
}
const r2Origin = normalizeR2Origin(process.env.NEXT_PUBLIC_R2_DOMAIN);
const r2Hostname = r2Origin ? (() => { try { return new URL(r2Origin).hostname; } catch { return null; } })() : null;
const imgSrc = ["'self'", r2Origin, "https://*.supabase.co", "data:", "blob:"]
  .filter(Boolean).join(' ');
const mediaSrc = ["'self'", r2Origin]
  .filter(Boolean).join(' ');

const isDev = process.env.NODE_ENV !== 'production';
const cspFallback = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${imgSrc}`,
  `media-src ${mediaSrc}`,
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co https://api.brevo.com https://*.upstash.io",
  "frame-src 'self' https://www.google.com https://maps.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join('; ') + ';';

const nextConfig = withBundleAnalyzer({
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      ...(r2Hostname ? [{ protocol: 'https', hostname: r2Hostname }] : []),
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
    verbose: false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-Powered-By', value: '' },
          {
            key: 'Content-Security-Policy',
            // Fallback CSP for static assets; middleware overrides this for page requests with a per-request nonce
            value: cspFallback,
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
      {
        source: '/admin/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'no-store, private' },
        ],
      },
    ];
  },
});

export default nextConfig
