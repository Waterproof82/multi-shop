import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';

/**
 * Columnas booleanas de `empresas` que controlan si un tenant tiene un módulo
 * contratado. Solo el superadmin las cambia (`superadminUpdateEmpresaSchema`).
 * Añadir una columna aquí la habilita para `flagModuloHabilitado` sin tocar
 * nada más.
 */
export type ColumnaFlagModulo = 'kits_caducidad_habilitado' | 'pet_id_qr_habilitado';

/**
 * ¿Tiene este tenant el módulo correspondiente a `columna` contratado?
 * Generalización de `kits-habilitado.ts` (DD11 de design.md): la consultan
 * las puertas de servidor de cada módulo (p. ej. `resolveKitsAdminContext`,
 * `resolveMascotasAdminContext`) y el layout del admin para el sidebar, así
 * que se cachea 60 s por (columna, empresa).
 *
 * Un error de BD aquí CIERRA (lanza): estas secciones exponen datos
 * personales y nadie depende de que sigan abiertas en pleno servicio. El
 * fallo tampoco se cachea, para que la siguiente petición vuelva a intentarlo.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { valor: boolean; expira: number }>();

export async function flagModuloHabilitado(empresaId: string, columna: ColumnaFlagModulo): Promise<boolean> {
  const clave = `${columna}:${empresaId}`;
  const ahora = Date.now();
  const enCache = cache.get(clave);
  if (enCache && enCache.expira > ahora) return enCache.valor;

  const { data, error } = await getSupabaseClient()
    .from('empresas')
    .select(columna)
    .eq('id', empresaId)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo comprobar el módulo (${columna})`);
  }

  const valor = Boolean((data as Record<ColumnaFlagModulo, boolean | undefined> | null)?.[columna]);
  cache.set(clave, { valor, expira: ahora + TTL_MS });
  return valor;
}
