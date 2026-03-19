import { logger } from '@/core/infrastructure/logging/logger';

export async function logApiError(
  context: string,
  error: unknown,
  method?: string
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  await logger.logAndReturnError(
    'API_ERROR',
    `${context}: ${message}`,
    'api',
    method || 'unknown',
    { details: { context } }
  );
}
