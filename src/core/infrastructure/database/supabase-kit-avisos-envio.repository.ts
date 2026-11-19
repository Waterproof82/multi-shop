// src/core/infrastructure/database/supabase-kit-avisos-envio.repository.ts
// kit-expiry-m3 (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m3/)
// M3d2/M3d3/M3d4: implementación real de `IKitAvisosEnvioRepository`
// (M3d1). service_role (`getSupabaseClient()` salta RLS) — esta tabla no
// tiene `empresa_id` en cada fila salvo `kits_registrados`/`kit_lotes`, así
// que cada consulta de envío filtra en el código; las purgas son GLOBALES
// a propósito (DD10, mismo patrón que `rgpd-purge`): la conservación de
// datos no puede depender de qué módulo o empresa los generó.
//
// M3d2 se partió en 3 PR (un método por PR, por el presupuesto de 400
// líneas, tasks.md): M3d2a `findEmpresasConAvisos`, M3d2b
// `findKitsConAvisos`, M3d2c `findLotesKit`. M3d3 añade
// caducidades/enviados/marcado; M3d4 añade las purgas. Hasta entonces, cada
// método devuelve `NOT_IMPLEMENTED`.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IKitAvisosEnvioRepository } from '@/core/domain/repositories/IKitAvisosEnvioRepository';
import type {
  CaducidadDeLote,
  CaducidadDeLoteMinima,
  EmpresaConAvisos,
  EnviadoAviso,
  FilaEnviado,
  KitConContacto,
  LoteKit,
} from '@/core/domain/entities/kit-avisos-envio-types';
import type { Result, AppError } from '@/core/domain/entities/types';

interface PgErrorLike {
  code?: string;
  message?: string;
}

/** R-M3.7.1: el mensaje nunca lleva email, teléfono ni token — solo recuentos o nada. */
function mapErrorEnvioAvisos(error: PgErrorLike, method: string): AppError {
  return { code: 'DB_ERROR', message: error.message ?? 'Error de base de datos', module: 'repository', method };
}

function noImplementado(method: string): AppError {
  return { code: 'NOT_IMPLEMENTED', message: `${method} aún no está implementado`, module: 'repository', method };
}

function mapEmpresaConAvisos(row: Record<string, unknown>, pausadas: ReadonlySet<string>): EmpresaConAvisos {
  const id = row.id as string;
  return { id, nombre: row.nombre as string, pausada: pausadas.has(id) };
}

export class SupabaseKitAvisosEnvioRepository implements IKitAvisosEnvioRepository {
  // R-M3.2.1: `kits_caducidad_habilitado = true`; una empresa sin fila en
  // `kit_avisos_config` no está pausada (DEFAULT false de la tabla, pero
  // aquí no hay fila que leer). Sin empresas habilitadas, no consulta
  // `kit_avisos_config`.
  async findEmpresasConAvisos(): Promise<Result<EmpresaConAvisos[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data: empresasData, error: empresasError } = await supabase
        .from('empresas')
        .select('id, nombre')
        .eq('kits_caducidad_habilitado', true);

      if (empresasError) {
        return { success: false, error: mapErrorEnvioAvisos(empresasError, 'findEmpresasConAvisos') };
      }
      const empresas = (empresasData ?? []) as Record<string, unknown>[];
      if (empresas.length === 0) {
        return { success: true, data: [] };
      }

      const ids = empresas.map((e) => e.id as string);
      const { data: configData, error: configError } = await supabase
        .from('kit_avisos_config')
        .select('empresa_id, avisos_pausados')
        .in('empresa_id', ids);

      if (configError) {
        return { success: false, error: mapErrorEnvioAvisos(configError, 'findEmpresasConAvisos') };
      }
      const pausadas = new Set(
        ((configData ?? []) as Record<string, unknown>[])
          .filter((fila) => fila.avisos_pausados === true)
          .map((fila) => fila.empresa_id as string),
      );
      return { success: true, data: empresas.map((e) => mapEmpresaConAvisos(e, pausadas)) };
    } catch (e) {
      return { success: false, error: mapErrorEnvioAvisos(e as PgErrorLike, 'findEmpresasConAvisos') };
    }
  }

  // M3d2b
  findKitsConAvisos(_empresaId: string, _desde: number, _hasta: number): Promise<Result<KitConContacto[]>> {
    return Promise.resolve({ success: false, error: noImplementado('findKitsConAvisos') });
  }

  // M3d2c
  findLotesKit(_empresaId: string, _loteIds: readonly string[]): Promise<Result<LoteKit[]>> {
    return Promise.resolve({ success: false, error: noImplementado('findLotesKit') });
  }

  // M3d3
  findCaducidades(_empresaId: string, _loteIds: readonly string[]): Promise<Result<CaducidadDeLote[]>> {
    return Promise.resolve({ success: false, error: noImplementado('findCaducidades') });
  }

  // M3d3
  findEnviados(_empresaId: string, _series: readonly string[]): Promise<Result<EnviadoAviso[]>> {
    return Promise.resolve({ success: false, error: noImplementado('findEnviados') });
  }

  // M3d3
  marcarEnviados(_empresaId: string, _filas: readonly FilaEnviado[]): Promise<Result<void>> {
    return Promise.resolve({ success: false, error: noImplementado('marcarEnviados') });
  }

  // M3d4
  purgarPendientes(_antesDe: string): Promise<Result<number>> {
    return Promise.resolve({ success: false, error: noImplementado('purgarPendientes') });
  }

  // M3d4
  findLotesConContacto(): Promise<Result<string[]>> {
    return Promise.resolve({ success: false, error: noImplementado('findLotesConContacto') });
  }

  // M3d4
  findUltimasCaducidades(_loteIds: readonly string[]): Promise<Result<CaducidadDeLoteMinima[]>> {
    return Promise.resolve({ success: false, error: noImplementado('findUltimasCaducidades') });
  }

  // M3d4
  purgarContactoDeLotes(_loteIds: readonly string[]): Promise<Result<number>> {
    return Promise.resolve({ success: false, error: noImplementado('purgarContactoDeLotes') });
  }
}
