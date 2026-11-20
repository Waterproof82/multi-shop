import { NextRequest, NextResponse } from 'next/server';
import { resolveAdminContextWithEmpresa } from './helpers';
import { flagModuloHabilitado } from '@/lib/empresa/flag-modulo';

/**
 * Puerta de servidor de `/api/admin/mascotas/*` (DD12 de design.md, calco de
 * `resolveKitsAdminContext`).
 *
 * No es un proxy: el proxy solo conoce el `x-empresa-id` del JWT y no el
 * `?empresaId=` que usa el superadmin para operar sobre otro tenant, así que
 * no podría comprobar el flag de la empresa OBJETIVO, no un privilegio
 * implícito del rol. Por eso es un helper de ruta: primero resuelve esa
 * empresa objetivo con `resolveAdminContextWithEmpresa` y, solo después,
 * comprueba su flag.
 *
 * - Flag desactivado → 403 sin datos (para cualquier rol).
 * - Error al comprobar el flag (BD caída) → 503, nunca deja pasar.
 */
export type MascotasAdminContext =
  | { empresaId: string; isSuperAdmin: boolean; error: null }
  | { empresaId: null; isSuperAdmin: boolean; error: NextResponse };

export async function resolveMascotasAdminContext(request: NextRequest): Promise<MascotasAdminContext> {
  const ctx = await resolveAdminContextWithEmpresa(request);
  if (ctx.error) return ctx;

  let habilitado: boolean;
  try {
    habilitado = await flagModuloHabilitado(ctx.empresaId, 'pet_id_qr_habilitado');
  } catch {
    return {
      empresaId: null,
      isSuperAdmin: ctx.isSuperAdmin,
      error: NextResponse.json({ error: 'No se pudo comprobar el módulo de mascotas' }, { status: 503 }),
    };
  }

  if (!habilitado) {
    return {
      empresaId: null,
      isSuperAdmin: ctx.isSuperAdmin,
      error: NextResponse.json({ error: 'Módulo no disponible' }, { status: 403 }),
    };
  }

  return { empresaId: ctx.empresaId, isSuperAdmin: ctx.isSuperAdmin, error: null };
}
