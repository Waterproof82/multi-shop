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

/** M3d3/DD4: tope del bloque de `.range()` al recorrer la vista de caducidades y los enviados. */
const BLOQUE_LECTURA = 1000;

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

function mapKitConContacto(row: Record<string, unknown>): KitConContacto {
  return {
    serie: row.serie as string,
    loteId: row.lote_id as string,
    email: row.email as string,
    token: row.baja_token as string,
    registradoAt: row.registrado_at as string,
  };
}

function mapLoteKit(row: Record<string, unknown>): LoteKit {
  const producto = row.productos as Record<string, unknown> | null | undefined;
  return {
    loteId: row.id as string,
    kitNombre: (producto?.titulo_es as string) ?? '',
    kitSlug: (producto?.slug as string | null) ?? null,
  };
}

function mapCaducidadDeLote(row: Record<string, unknown>): CaducidadDeLote {
  return {
    loteId: row.lote_id as string,
    ingredienteId: row.ingrediente_id as string,
    consumible: row.consumible as string,
    parte: row.parte as string,
    caducaEl: row.caduca_el as string,
  };
}

function mapEnviadoAviso(row: Record<string, unknown>): EnviadoAviso {
  return {
    serie: row.serie as string,
    ingredienteId: row.ingrediente_id as string,
    parte: row.parte as string,
    umbralDias: row.umbral_dias as 30 | 15,
    enviadoAt: row.enviado_at as string,
  };
}

function filaMarcarEnviado(empresaId: string, fila: FilaEnviado, ahora: string): Record<string, unknown> {
  return {
    serie: fila.serie,
    empresa_id: empresaId,
    ingrediente_id: fila.ingredienteId,
    parte: fila.parte,
    umbral_dias: fila.umbralDias,
    canal: 'email',
    enviado_at: ahora,
  };
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

  // R-M3.2.2/DD4: bloque de `desde`/`hasta` (200 kits) ordenado por `serie`
  // para que la paginación entre llamadas del caso de uso sea estable.
  // `select` exacto — nunca `telefono` ni `*` — esta lectura solo necesita
  // email para enviar y token para el enlace de baja.
  async findKitsConAvisos(empresaId: string, desde: number, hasta: number): Promise<Result<KitConContacto[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kits_registrados')
        .select('serie, lote_id, email, baja_token, registrado_at')
        .eq('empresa_id', empresaId)
        .not('registrado_at', 'is', null)
        .not('consiente_email_at', 'is', null)
        .not('email', 'is', null)
        .order('serie')
        .range(desde, hasta);

      if (error) {
        return { success: false, error: mapErrorEnvioAvisos(error, 'findKitsConAvisos') };
      }
      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapKitConContacto) };
    } catch (e) {
      return { success: false, error: mapErrorEnvioAvisos(e as PgErrorLike, 'findKitsConAvisos') };
    }
  }

  // R-M3.2.3: nombre y slug del kit de cada lote del bloque leído por
  // `findKitsConAvisos`.
  async findLotesKit(empresaId: string, loteIds: readonly string[]): Promise<Result<LoteKit[]>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('kit_lotes')
        .select('id, productos(titulo_es, slug)')
        .eq('empresa_id', empresaId)
        .in('id', loteIds as string[]);

      if (error) {
        return { success: false, error: mapErrorEnvioAvisos(error, 'findLotesKit') };
      }
      return { success: true, data: ((data ?? []) as Record<string, unknown>[]).map(mapLoteKit) };
    } catch (e) {
      return { success: false, error: mapErrorEnvioAvisos(e as PgErrorLike, 'findLotesKit') };
    }
  }

  // R-M3.2.3/DD4: caducidades efectivas de los lotes del bloque, recorriendo
  // `.range()` en bloques de `BLOQUE_LECTURA` hasta agotar (patrón de
  // `findSeriesDeLote`, M2a).
  async findCaducidades(empresaId: string, loteIds: readonly string[]): Promise<Result<CaducidadDeLote[]>> {
    try {
      const supabase = getSupabaseClient();
      const caducidades: CaducidadDeLote[] = [];

      for (let desde = 0; ; desde += BLOQUE_LECTURA) {
        const { data, error } = await supabase
          .from('kit_lote_caducidades_efectivas')
          .select('lote_id, ingrediente_id, consumible, parte, caduca_el')
          .eq('empresa_id', empresaId)
          .in('lote_id', loteIds as string[])
          .range(desde, desde + BLOQUE_LECTURA - 1);

        if (error) {
          return { success: false, error: mapErrorEnvioAvisos(error, 'findCaducidades') };
        }
        const filas = (data ?? []) as Record<string, unknown>[];
        caducidades.push(...filas.map(mapCaducidadDeLote));
        if (filas.length < BLOQUE_LECTURA) break;
      }

      return { success: true, data: caducidades };
    } catch (e) {
      return { success: false, error: mapErrorEnvioAvisos(e as PgErrorLike, 'findCaducidades') };
    }
  }

  // R-M3.2.4/DD4: avisos ya enviados por email de las series del bloque,
  // recorriendo `.range()` hasta agotar.
  async findEnviados(empresaId: string, series: readonly string[]): Promise<Result<EnviadoAviso[]>> {
    try {
      const supabase = getSupabaseClient();
      const enviados: EnviadoAviso[] = [];

      for (let desde = 0; ; desde += BLOQUE_LECTURA) {
        const { data, error } = await supabase
          .from('kit_avisos_enviados')
          .select('serie, ingrediente_id, parte, umbral_dias, enviado_at')
          .eq('empresa_id', empresaId)
          .eq('canal', 'email')
          .in('serie', series as string[])
          .range(desde, desde + BLOQUE_LECTURA - 1);

        if (error) {
          return { success: false, error: mapErrorEnvioAvisos(error, 'findEnviados') };
        }
        const filas = (data ?? []) as Record<string, unknown>[];
        enviados.push(...filas.map(mapEnviadoAviso));
        if (filas.length < BLOQUE_LECTURA) break;
      }

      return { success: true, data: enviados };
    } catch (e) {
      return { success: false, error: mapErrorEnvioAvisos(e as PgErrorLike, 'findEnviados') };
    }
  }

  // R-M3.3.1/DD3: `upsert` sobre la PK de `kit_avisos_enviados` — una
  // repetición del mismo aviso solo actualiza `enviado_at`. Lista vacía no
  // llama a la BD (el caso de uso puede no tener nada que marcar hoy).
  async marcarEnviados(empresaId: string, filas: readonly FilaEnviado[]): Promise<Result<void>> {
    if (filas.length === 0) {
      return { success: true, data: undefined };
    }
    try {
      const supabase = getSupabaseClient();
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from('kit_avisos_enviados')
        .upsert(
          filas.map((fila) => filaMarcarEnviado(empresaId, fila, ahora)),
          { onConflict: 'serie,ingrediente_id,parte,umbral_dias,canal' },
        );

      if (error) {
        return { success: false, error: mapErrorEnvioAvisos(error, 'marcarEnviados') };
      }
      return { success: true, data: undefined };
    } catch (e) {
      return { success: false, error: mapErrorEnvioAvisos(e as PgErrorLike, 'marcarEnviados') };
    }
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
