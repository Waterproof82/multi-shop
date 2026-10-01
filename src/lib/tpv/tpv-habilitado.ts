import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

/**
 * ¿Tiene este tenant el TPV contratado? (`empresas.tpv_habilitado`, solo lo
 * cambia el superadmin). Lo consulta el proxy en CADA petición a /api/tpv y
 * /api/laborcontrol, así que se cachea 60 s por empresa: apagar el TPV desde
 * el superadmin tarda como mucho un minuto en surtir efecto.
 *
 * Ante un error de BD se DEJA PASAR y no se cachea: es un interruptor de
 * producto, no la barrera de seguridad (la autenticación ya pasó). Cortar el
 * cobro a un restaurante en pleno servicio por un fallo transitorio de
 * PostgREST sería peor que dejar entrar un minuto de más a quien no lo tiene.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { valor: boolean; expira: number }>();

export async function tpvHabilitadoParaEmpresa(empresaId: string): Promise<boolean> {
  const ahora = Date.now();
  const enCache = cache.get(empresaId);
  if (enCache && enCache.expira > ahora) return enCache.valor;

  const { data, error } = await getSupabaseClient()
    .from('empresas')
    .select('tpv_habilitado')
    .eq('id', empresaId)
    .maybeSingle();
  if (error) return true;

  const valor = Boolean((data as { tpv_habilitado?: boolean } | null)?.tpv_habilitado);
  cache.set(empresaId, { valor, expira: ahora + TTL_MS });
  return valor;
}
