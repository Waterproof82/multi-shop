import { validateEnv } from '@/core/infrastructure/env-validation';

export function register() {
  validateEnv();
}
