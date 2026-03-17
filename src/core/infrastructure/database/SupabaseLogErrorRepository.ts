import { SupabaseClient } from '@supabase/supabase-js';
import { ILogErrorRepository, LogErrorData } from '@/core/domain/repositories/ILogErrorRepository';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value);
}

export class SupabaseLogErrorRepository implements ILogErrorRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async log(data: LogErrorData): Promise<void> {
    // Validate empresaId - only use if it's a valid UUID
    const empresaId = isValidUUID(data.empresaId) ? data.empresaId : null;
    
    const { error } = await this.supabase
      .from('log_errors')
      .insert({
        empresa_id: empresaId,
        codigo: data.codigo,
        mensaje: data.mensaje,
        modulo: data.modulo,
        metodo: data.metodo || null,
        stack_trace: data.stackTrace || null,
        request_path: data.requestPath || null,
        request_method: data.requestMethod || null,
        user_id: data.userId || null,
        metadata: data.metadata || {},
        severity: data.severity || 'error',
      });

    if (error) {
      // Log to console as fallback
      console.error('[LOG_ERROR_FAILED]', error.message, {
        ...data,
        empresa_id_valid: isValidUUID(data.empresaId),
        empresaId_received: data.empresaId,
      });
    }
  }
}
