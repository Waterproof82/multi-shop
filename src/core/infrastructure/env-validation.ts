/**
 * Centralized environment variable validation.
 * Call validateEnv() at application startup to fail fast if required secrets are missing.
 *
 * In production, missing critical secrets throw immediately.
 * In development, warnings are logged for optional-but-recommended vars.
 */

interface EnvVar {
  name: string;
  /** If true: always required (fail in both envs). If false: only warn. */
  required: boolean;
  /** If true: treated as required only in production; warn in dev. */
  productionOnly?: boolean;
  /** If true: only warn (never throw), even in production. Use for optional services. */
  warnOnly?: boolean;
}

const ENV_VARS: EnvVar[] = [
  // Auth
  { name: 'ACCESS_TOKEN_SECRET', required: true },
  { name: 'CSRF_HMAC_SECRET', required: true },
  { name: 'CART_TOKEN_SECRET', required: true },
  { name: 'UNSUBSCRIBE_HMAC_SECRET', required: true, productionOnly: true },
  // Supabase
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  // Rate limiting & JWT revocation (critical in production)
  { name: 'UPSTASH_REDIS_REST_URL', required: true, productionOnly: true },
  { name: 'UPSTASH_REDIS_REST_TOKEN', required: true, productionOnly: true },
  // CORS (critical in production)
  { name: 'CORS_ALLOWED_DOMAINS', required: true, productionOnly: true },
  // Email (Brevo) — optional service: warn only, fail lazily at use time
  { name: 'BREVO_API_KEY', required: false, productionOnly: true, warnOnly: true },
  { name: 'BREVO_DEFAULT_SENDER_EMAIL', required: false, productionOnly: true, warnOnly: true },
  // Storage (Cloudflare R2) — optional service: warn only, fail lazily at use time
  { name: 'R2_ACCOUNT_ID', required: false, productionOnly: true, warnOnly: true },
  { name: 'R2_ACCESS_KEY_ID', required: false, productionOnly: true, warnOnly: true },
  { name: 'R2_SECRET_ACCESS_KEY', required: false, productionOnly: true, warnOnly: true },
  { name: 'R2_BUCKET_NAME', required: false, productionOnly: true, warnOnly: true },
  { name: 'NEXT_PUBLIC_R2_DOMAIN', required: false, productionOnly: true, warnOnly: true },
];

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];
    if (!value) {
      if (envVar.warnOnly) {
        warnings.push(envVar.name);
      } else if (envVar.productionOnly && !isProduction) {
        warnings.push(envVar.name);
      } else if (envVar.required) {
        missing.push(envVar.name);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `[env-validation] Missing recommended env vars (required in production): ${warnings.join(', ')}`
    );
  }

  if (missing.length > 0) {
    const message = `[env-validation] FATAL: Missing required environment variables: ${missing.join(', ')}`;
    if (isProduction) {
      throw new Error(message);
    }
    console.error(message);
  }
}
