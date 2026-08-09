import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

/**
 * Resolución de sesión del TPV en el SERVIDOR, en un solo sitio.
 *
 * Este mismo "admin primero, empleado después" estaba escrito tres veces: en
 * `src/proxy.ts`, en `src/app/tpv/layout.tsx` y en
 * `src/app/tpv/turno/cerrar/page.tsx`. Tres copias de una decisión de
 * autorización es una invitación a que una se quede atrás.
 *
 * EL ORDEN ES PARTE DEL CONTRATO. Un admin que abre el TPV lleva `admin_token`,
 * y probar antes el de empleado le asignaría el rol equivocado —típicamente uno
 * MENOR, así que el fallo se manifiesta como "no me deja hacer X" y se depura
 * en el sitio equivocado.
 *
 * `proxy.ts` mantiene su propia versión a propósito: allí se trabaja con
 * `NextRequest` y se devuelven respuestas HTTP, no sesiones. Si cambia el orden
 * aquí, tiene que cambiar allí.
 */

const ROLES_VALIDOS = new Set<RolAdmin>(['superadmin', 'admin', 'encargado', 'cajero']);

export interface SesionTpv {
  rol: RolAdmin;
  empresaId: string;
  esEmpleado: boolean;
  /** Solo lo trae la sesión de empleado; el admin no ficha. */
  empleadoId?: string;
  /**
   * Viene relleno SOLO en sesión de admin, donde llega gratis con el token.
   *
   * En la de empleado hay que consultarlo, y no todas las pantallas lo
   * necesitan: se deja a quien lo use para no cobrar una consulta extra a las
   * que no pintan el nombre.
   */
  empresaNombre: string | null;
}

/** Lo mínimo que necesitamos del almacén de cookies, sin atarnos a tipos de Next. */
export interface Galletas {
  get(nombre: string): { value: string } | undefined;
}

async function sesionDeAdmin(galletas: Galletas): Promise<SesionTpv | null> {
  const token = galletas.get('admin_token')?.value;
  if (!token) return null;

  const admin = await getAuthAdminUseCase().verifyToken(token);
  if (!admin || !ROLES_VALIDOS.has(admin.rol)) return null;

  const empresaId = admin.empresaId ?? admin.empresa?.id ?? null;
  if (!empresaId) return null;

  return {
    rol: admin.rol,
    empresaId,
    esEmpleado: false,
    empresaNombre: admin.empresa?.nombre ?? null,
  };
}

async function sesionDeEmpleado(galletas: Galletas): Promise<SesionTpv | null> {
  const token = galletas.get('tpv_employee_token')?.value;
  if (!token) return null;

  const payload = await verifyTpvEmployeeToken(token);
  if (!payload) return null;

  return {
    rol: payload.rol,
    empresaId: payload.empresaId,
    esEmpleado: true,
    empleadoId: payload.empleadoId,
    empresaNombre: null,
  };
}

export async function resolverSesionTpv(galletas: Galletas): Promise<SesionTpv | null> {
  return (await sesionDeAdmin(galletas)) ?? (await sesionDeEmpleado(galletas));
}
