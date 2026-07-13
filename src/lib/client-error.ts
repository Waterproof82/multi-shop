import { AppError, ErrorModule } from '@/core/domain/entities/types';
import * as Sentry from '@sentry/nextjs';

/**
 * Client-safe error handler for React components
 * Uses Result pattern and safe console logging
 */

type ClientErrorModule = Exclude<ErrorModule, 'repository'>;

function createClientError(
  code: string,
  message: string,
  method: string,
  module: ClientErrorModule = 'use-case',
): AppError {
  return {
    code,
    message,
    module,
    method,
    severity: 'error',
  };
}

function safeLogError(error: AppError): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${error.module}:${error.method}] ${error.code}: ${error.message}`, error.details);
  }
}

export function logClientError(
  error: unknown,
  method: string,
  module: ClientErrorModule = 'use-case',
): AppError {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const appError = createClientError('CLIENT_ERROR', message, method, module);
  safeLogError(appError);

  // Forward to Sentry — captures client errors in production (previously silent)
  Sentry.captureException(error instanceof Error ? error : new Error(message), {
    tags: {
      codigo: 'CLIENT_ERROR',
      modulo: module,
      metodo: method,
    },
  });

  return appError;
}

