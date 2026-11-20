import { flagModuloHabilitado } from '@/lib/empresa/flag-modulo';

/**
 * ¿Tiene este tenant el módulo de caducidad de kits contratado?
 * (`empresas.kits_caducidad_habilitado`, solo lo cambia el superadmin). La
 * consultan cada ruta de `/api/admin/kits/*` (vía `resolveKitsAdminContext`)
 * y el layout del admin para el sidebar.
 *
 * Delega en `flagModuloHabilitado` (DD11 de design.md, generalización de este
 * mismo módulo): misma API pública y mismo comportamiento de siempre (caché
 * 60 s, cierra si la BD falla y no cachea el fallo), ahora compartido con
 * otros módulos por tenant como el de la chapa QR de mascotas.
 */
export async function kitsCaducidadHabilitadoParaEmpresa(empresaId: string): Promise<boolean> {
  return flagModuloHabilitado(empresaId, 'kits_caducidad_habilitado');
}
