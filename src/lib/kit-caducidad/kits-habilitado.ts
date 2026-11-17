import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

/**
 * ¿Tiene este tenant el módulo de caducidad de kits contratado?
 * (`empresas.kits_caducidad_habilitado`, solo lo cambia el superadmin). La
 * consultan cada ruta de `/api/admin/kits/*` (vía `resolveKitsAdminContext`)
 * y el layout del admin para el sidebar, así que se cachea 60 s por empresa,
 * igual que `tpv-habilitado.ts`.
 *
 * A diferencia del TPV, un error de BD aquí CIERRA (lanza): nadie depende de
 * que esta sección siga abierta en pleno servicio, y expone datos personales
 * de los registros de kits (DD2 de design.md). El fallo tampoco se cachea,
 * para que la siguiente petición vuelva a intentarlo.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { valor: boolean; expira: number }>();

export async function kitsCaducidadHabilitadoParaEmpresa(empresaId: string): Promise<boolean> {
  const ahora = Date.now();
  const enCache = cache.get(empresaId);
  if (enCache && enCache.expira > ahora) return enCache.valor;

  const { data, error } = await getSupabaseClient()
    .from('empresas')
    .select('kits_caducidad_habilitado')
    .eq('id', empresaId)
    .maybeSingle();
  if (error) {
    throw new Error('No se pudo comprobar el módulo de kits de caducidad');
  }

  const valor = Boolean((data as { kits_caducidad_habilitado?: boolean } | null)?.kits_caducidad_habilitado);
  cache.set(empresaId, { valor, expira: ahora + TTL_MS });
  return valor;
}
