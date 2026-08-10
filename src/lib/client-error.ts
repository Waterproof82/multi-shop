import { AppError, ErrorModule, ErrorSeverity } from '@/core/domain/entities/types';
import * as Sentry from '@sentry/nextjs';

/**
 * Client-safe error handler for React components
 * Uses Result pattern and safe console logging
 */

type ClientErrorModule = Exclude<ErrorModule, 'repository'>;

// Todos los call-sites de logClientError son un catch() envolviendo un
// fetch(): un TypeError ahi es un fallo de RED (sin conexion, wifi
// degradado) — condicion normal en esta app, no un bug. Cualquier otro tipo
// de error en ese mismo catch (p. ej. res.json() con una respuesta
// malformada) SI indica que algo se rompio de verdad.
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

function createClientError(
  code: string,
  message: string,
  method: string,
  module: ClientErrorModule,
  severity: ErrorSeverity,
): AppError {
  return {
    code,
    message,
    module,
    method,
    severity,
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
  const severity: ErrorSeverity = isNetworkFailure(error) ? 'warning' : 'error';
  const appError = createClientError('CLIENT_ERROR', message, method, module, severity);
  safeLogError(appError);

  // Forward to Sentry — captures client errors in production. 'warning' se
  // sigue devolviendo/logueando en consola, pero no se captura como
  // excepcion (mismo contrato que ErrorLogger.logError en el servidor).
  if (severity !== 'warning') {
    Sentry.captureException(error instanceof Error ? error : new Error(message), {
      tags: {
        codigo: 'CLIENT_ERROR',
        modulo: module,
        metodo: method,
      },
    });
  }

  return appError;
}

