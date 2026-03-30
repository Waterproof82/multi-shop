import { getSupabaseClient } from '../database/supabase-client';
import { SupabaseLogErrorRepository } from '../database/SupabaseLogErrorRepository';
import { LogErrorData } from '@/core/domain/repositories/ILogErrorRepository';
import { AppError, ErrorModule, ErrorSeverity } from '@/core/domain/entities/types';

let loggerInstance: ErrorLogger | null = null;

/**
 * ErrorLogger - Singleton para logging centralizado de errores
 * 
 * Usar para capturar y almacenar errores en la tabla log_errors de Supabase.
 * Implementa patrón singleton para mantener una única instancia.
 * 
 * IMPORTANT: Only initialize on server-side. Client-side logging falls back to console.
 */
export class ErrorLogger {
  private readonly repository: SupabaseLogErrorRepository | null;
  private readonly supabaseAvailable: boolean;

  constructor() {
    // Only try to initialize Supabase on server-side
    if (globalThis.window !== undefined) {
      this.repository = null;
      this.supabaseAvailable = false;
      return;
    }

    let repository: SupabaseLogErrorRepository | null = null;
    let supabaseAvailable = false;

    try {
      const supabase = getSupabaseClient();
      repository = new SupabaseLogErrorRepository(supabase);
      supabaseAvailable = true;
    } catch (error) {
      console.warn('[ERROR_LOGGER] Supabase not configured, logging to console only:', error);
      repository = null;
      supabaseAvailable = false;
    }

    this.repository = repository;
    this.supabaseAvailable = supabaseAvailable;
  }

  /**
   * Obtiene la instancia singleton del logger
   */
  static getInstance(): ErrorLogger {
    loggerInstance ??= new ErrorLogger();
    return loggerInstance;
  }

  /**
   * Loguea un error de forma síncrona
   * @param data Datos del error a loguear
   */
  async logError(data: LogErrorData): Promise<void> {
    if (this.repository) {
      try {
        await this.repository.log(data);
      } catch (e) {
        console.error('[ERROR_LOGGER_FAILED]', e);
      }
    } else {
      // Fallback to console logging when Supabase is not available
      console.error('[ERROR_LOG]', {
        codigo: data.codigo,
        mensaje: data.mensaje,
        modulo: data.modulo,
        severity: data.severity,
        metadata: data.metadata,
      });
    }
  }

  /**
   * Crea un AppError estructurado y lo loguea
   */
  async logAndReturnError(
    code: string,
    message: string,
    module: ErrorModule,
    method: string,
    options?: {
      empresaId?: string;
      details?: Record<string, unknown>;
      stackTrace?: string;
      severity?: ErrorSeverity;
      requestPath?: string;
      requestMethod?: string;
      userId?: string;
    }
  ): Promise<AppError> {
    const error: AppError = {
      code,
      message,
      module,
      method,
      details: options?.details,
      severity: options?.severity || 'error',
    };

    await this.logError({
      empresaId: options?.empresaId,
      codigo: code,
      mensaje: message,
      modulo: module,
      metodo: method,
      stackTrace: options?.stackTrace,
      requestPath: options?.requestPath,
      requestMethod: options?.requestMethod,
      userId: options?.userId,
      metadata: options?.details,
      severity: options?.severity || 'error',
    });

    return error;
  }

  /**
   * Loguea un error desde un bloque catch
   */
  async logFromCatch(
    error: unknown,
    module: ErrorModule,
    method: string,
    options?: {
      empresaId?: string;
      requestPath?: string;
      requestMethod?: string;
      userId?: string;
      severity?: ErrorSeverity;
      details?: Record<string, unknown>;
    }
  ): Promise<AppError> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return this.logAndReturnError(
      'UNHANDLED_ERROR',
      errorMessage,
      module,
      method,
      {
        empresaId: options?.empresaId,
        stackTrace: errorStack,
        severity: options?.severity,
        requestPath: options?.requestPath,
        requestMethod: options?.requestMethod,
        userId: options?.userId,
        details: options?.details,
      }
    );
  }
}

/**
 * Helper para obtener el logger singleton rápidamente
 */
export const logger = ErrorLogger.getInstance();
