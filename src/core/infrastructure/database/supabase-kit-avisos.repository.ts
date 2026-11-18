// src/core/infrastructure/database/supabase-kit-avisos.repository.ts
// kit-expiry-m2b, DD1/DD2 de design.md: service_role (getSupabaseClient()
// salta RLS) — cada consulta filtra por empresa_id en el código (R-M2b.6.1).
// Nunca se selecciona `*`; solo `findContacto`/`findPorToken` leen el email
// o el token, y ninguno de los dos sale de esta capa en una respuesta HTTP.
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { AltaAvisosInput, ContactoAvisos, GestionPorToken } from '@/core/domain/entities/kit-avisos-types';
import type { Result, AppError } from '@/core/domain/entities/types';

const TABLA = 'kits_registrados';

interface PgErrorLike {
  code?: string;
  message?: string;
}

/**
 * R-M2b.6.2: el mensaje NUNCA lleva el email ni el token — solo la serie,
 * truncada a 8 caracteres, igual que `mapPgError` de M4d/M2a.
 */
function mapErrorKitAvisos(error: PgErrorLike, method: string, serie?: string): AppError {
  const sufijo = serie ? ` (serie ${serie.slice(0, 8)}…)` : '';
  return { code: 'DB_ERROR', message: `${error.message ?? 'Error de base de datos'}${sufijo}`, module: 'repository', method };
}

function mapContactoAvisos(row: Record<string, unknown>): ContactoAvisos {
  return {
    estado: row.registrado_at ? 'registrada' : 'pendiente',
    email: row.email as string,
    token: row.baja_token as string,
  };
}

export class SupabaseKitAvisosRepository implements IKitAvisosRepository {
  // DD2: una sola `update()` con la actualización condicional atómica — la
  // fila se reserva SOLO si está libre (`email IS NULL`) o si es un
  // pendiente ya caducado. El ISO va ENTRE COMILLAS dentro de `or()` porque
  // PostgREST separa por comas y por puntos; sin las comillas, un ISO con
  // dos puntos (`:`) rompería el parseo del filtro.
  async reservarAlta(empresaId: string, input: AltaAvisosInput): Promise<Result<boolean>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(TABLA)
        .update({
          email: input.email,
          telefono: input.telefono,
          consiente_email_at: input.ahora,
          consiente_whatsapp_at: input.whatsapp ? input.ahora : null,
          texto_consentimiento_version: input.version,
          baja_token: input.token,
          registrado_at: null,
        })
        .eq('empresa_id', empresaId)
        .eq('serie', input.serie)
        .or(`email.is.null,and(registrado_at.is.null,consiente_email_at.lt."${input.pendienteCaducaAntesDe}")`)
        .select('serie');

      if (error) {
        return { success: false, error: mapErrorKitAvisos(error, 'reservarAlta', input.serie) };
      }
      return { success: true, data: ((data ?? []) as unknown[]).length === 1 };
    } catch (e) {
      return { success: false, error: mapErrorKitAvisos(e as PgErrorLike, 'reservarAlta', input.serie) };
    }
  }

  // R-M2b.2.4: SOLO estas 3 columnas — nunca `*`, nunca telefono ni consiente_*.
  async findContacto(empresaId: string, serie: string): Promise<Result<ContactoAvisos | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(TABLA)
        .select('email, registrado_at, baja_token')
        .eq('empresa_id', empresaId)
        .eq('serie', serie)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapErrorKitAvisos(error, 'findContacto', serie) };
      }
      const fila = data as Record<string, unknown> | null;
      if (!fila || !fila.email) {
        return { success: true, data: null };
      }
      return { success: true, data: mapContactoAvisos(fila) };
    } catch (e) {
      return { success: false, error: mapErrorKitAvisos(e as PgErrorLike, 'findContacto', serie) };
    }
  }

  // R-M2b.3.2: la expiración de un pendiente se decide en código (no en la
  // query) porque, a diferencia de `reservarAlta`, aquí SÍ hace falta
  // distinguir "token inexistente" (null) de "pendiente caducado" (también
  // null, pero por otra razón) para que el 404 sea el mismo en ambos casos.
  async findPorToken(empresaId: string, token: string, pendienteCaducaAntesDe: string): Promise<Result<GestionPorToken | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(TABLA)
        .select('serie, registrado_at, texto_consentimiento_version, consiente_email_at')
        .eq('empresa_id', empresaId)
        .eq('baja_token', token)
        .maybeSingle();

      if (error) {
        return { success: false, error: mapErrorKitAvisos(error, 'findPorToken') };
      }
      const fila = data as Record<string, unknown> | null;
      if (!fila) {
        return { success: true, data: null };
      }

      const pendiente = !fila.registrado_at;
      const consienteEmailAt = fila.consiente_email_at as string | null;
      if (pendiente && consienteEmailAt && consienteEmailAt < pendienteCaducaAntesDe) {
        return { success: true, data: null };
      }

      return {
        success: true,
        data: {
          serie: fila.serie as string,
          estado: pendiente ? 'pendiente' : 'registrada',
          version: (fila.texto_consentimiento_version as string | null) ?? null,
        },
      };
    } catch (e) {
      return { success: false, error: mapErrorKitAvisos(e as PgErrorLike, 'findPorToken') };
    }
  }

  // R-M2b.3.5: la propia query ya excluye lo que `findPorToken` descarta en
  // código — `is('registrado_at', null)` (sigue pendiente) y
  // `gt('consiente_email_at', limite)` (no ha caducado). 0 filas cubre los
  // dos motivos (ya confirmado, caducado o token inexistente) con el mismo `null`.
  async confirmar(empresaId: string, token: string, pendienteCaducaAntesDe: string): Promise<Result<GestionPorToken | null>> {
    try {
      const supabase = getSupabaseClient();
      const ahora = new Date().toISOString();
      const { data, error } = await supabase
        .from(TABLA)
        .update({ registrado_at: ahora })
        .eq('empresa_id', empresaId)
        .eq('baja_token', token)
        .is('registrado_at', null)
        .gt('consiente_email_at', pendienteCaducaAntesDe)
        .select('serie, texto_consentimiento_version');

      if (error) {
        return { success: false, error: mapErrorKitAvisos(error, 'confirmar') };
      }
      const fila = ((data ?? []) as Record<string, unknown>[])[0];
      if (!fila) {
        return { success: true, data: null };
      }
      return {
        success: true,
        data: { serie: fila.serie as string, estado: 'registrada', version: (fila.texto_consentimiento_version as string | null) ?? null },
      };
    } catch (e) {
      return { success: false, error: mapErrorKitAvisos(e as PgErrorLike, 'confirmar') };
    }
  }

  // D-M2b-4/R-M2b.3.5: UNA sola `update()` revoca los dos consentimientos y
  // borra el email, el teléfono, la versión y el token — la serie queda
  // libre de nuevo. 0 filas = el token ya no existía (doble clic, o ya dado
  // de baja antes).
  async borrar(empresaId: string, token: string): Promise<Result<{ serie: string } | null>> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from(TABLA)
        .update({
          email: null,
          telefono: null,
          consiente_email_at: null,
          consiente_whatsapp_at: null,
          texto_consentimiento_version: null,
          baja_token: null,
          registrado_at: null,
        })
        .eq('empresa_id', empresaId)
        .eq('baja_token', token)
        .select('serie');

      if (error) {
        return { success: false, error: mapErrorKitAvisos(error, 'borrar') };
      }
      const fila = ((data ?? []) as Record<string, unknown>[])[0];
      if (!fila) {
        return { success: true, data: null };
      }
      return { success: true, data: { serie: fila.serie as string } };
    } catch (e) {
      return { success: false, error: mapErrorKitAvisos(e as PgErrorLike, 'borrar') };
    }
  }
}
