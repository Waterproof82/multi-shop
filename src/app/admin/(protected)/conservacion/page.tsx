import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Archive } from 'lucide-react';
import { getAuthAdminUseCase, getHistorialUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { ConservacionTraducida } from '@/components/conservacion/conservacion-traducida';
import { TextoTraducido } from '@/components/texto-traducido';

export const dynamic = 'force-dynamic';

export default async function ConservacionAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await getAuthAdminUseCase().verifyToken(token);
  if (!admin) redirect('/admin/login');

  let empresaId = admin.empresaId;
  const esSuperadmin = admin.rol === SUPERADMIN_ROLE;
  if (esSuperadmin) {
    const superadminEmpresaId = cookieStore.get('superadmin_empresa_id')?.value;
    if (!superadminEmpresaId) redirect('/superadmin');
    empresaId = superadminEmpresaId;
  }
  if (!empresaId) redirect('/admin/login');

  const resumen = await getHistorialUseCase().resumenRetencion(empresaId);
  if (!resumen.success) {
    throw new Error('No se pudo cargar el resumen de conservación');
  }
  const filas = resumen.data.map(({ apartado, ejercicio, registros }) => ({ apartado, ejercicio, registros }));

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <Archive className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-bold text-white"><TextoTraducido k="conservacionTitulo" /></h2>
          <p className="text-sm text-slate-400 mt-0.5"><TextoTraducido k="conservacionSubtitulo" /></p>
        </div>
      </div>
      <ConservacionTraducida filas={filas} conDescargas empresaIdSuperadmin={esSuperadmin ? empresaId : undefined} />
    </div>
  );
}
