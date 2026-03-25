/**
 * Centralized environment variable validation.
 * Call validateEnv() at application startup to fail fast if required secrets are missing.
 *
 * In production, missing critical secrets throw immediately.
 * In development, warnings are logged for optional-but-recommended vars.
 */

interface EnvVar {
  name: string;
  required: boolean;
  /** Only required in production */
  productionOnly?: boolean;
}

const ENV_VARS: EnvVar[] = [
  // Auth
  { name: 'ACCESS_TOKEN_SECRET', required: true },
  { name: 'CSRF_HMAC_SECRET', required: true },
  { name: 'CART_TOKEN_SECRET', required: true },
  // Supabase
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  // Rate limiting & JWT revocation (critical in production)
  { name: 'UPSTASH_REDIS_REST_URL', required: true, productionOnly: true },
  { name: 'UPSTASH_REDIS_REST_TOKEN', required: true, productionOnly: true },
  // CORS (critical in production)
  { name: 'CORS_ALLOWED_DOMAINS', required: true, productionOnly: true },
];

export function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];
    if (!value) {
      if (envVar.productionOnly && !isProduction) {
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
