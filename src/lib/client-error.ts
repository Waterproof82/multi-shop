import { AppError, ErrorModule, Result } from '@/core/domain/entities/types';

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

export function handleClientError<T>(
  error: unknown,
  fallbackData: T,
  method: string,
  module: ClientErrorModule = 'use-case',
): Result<T> {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const appError = createClientError('CLIENT_ERROR', message, method, module);
  safeLogError(appError);
  return { success: false, error: appError };
}

export function logClientError(
  error: unknown,
  method: string,
  module: ClientErrorModule = 'use-case',
): AppError {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const appError = createClientError('CLIENT_ERROR', message, method, module);
  safeLogError(appError);
  return appError;
}

export function isResultError<T>(result: Result<T>): boolean {
  return !result.success;
}
