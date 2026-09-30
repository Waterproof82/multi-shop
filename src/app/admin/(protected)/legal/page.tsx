import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Scale } from 'lucide-react';
import { getAuthAdminUseCase, getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { LegalSettingsForm } from '@/components/admin/legal/LegalSettingsForm';
import { TextoTraducido } from '@/components/texto-traducido';

export const dynamic = 'force-dynamic';

export default async function LegalAdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await getAuthAdminUseCase().verifyToken(token);
  if (!admin) redirect('/admin/login');

  let empresaId = admin.empresaId;
  if (admin.rol === SUPERADMIN_ROLE) {
    const superadminEmpresaId = cookieStore.get('superadmin_empresa_id')?.value;
    if (!superadminEmpresaId) redirect('/superadmin');
    empresaId = superadminEmpresaId;
  }
  if (!empresaId) redirect('/admin/login');

  const useCase = getEmpresaLegalUseCase();
  const [contexto, legal] = await Promise.all([useCase.getContext(empresaId), useCase.get(empresaId)]);
  if (!contexto.success || !legal.success) {
    throw new Error('No se pudieron cargar los datos legales');
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="w-6 h-6 text-cyan-400 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-2xl font-bold text-white"><TextoTraducido k="legalAdminTitle" /></h2>
          <p className="text-sm text-slate-400 mt-0.5"><TextoTraducido k="legalAdminSubtitle" /></p>
        </div>
      </div>
      <LegalSettingsForm
        inicial={legal.data}
        titular={contexto.data.titular}
        flags={{ tipo: contexto.data.tipo, deliveryHabilitado: contexto.data.flags.deliveryHabilitado, envioDomicilioHabilitado: contexto.data.flags.envioDomicilioHabilitado }}
      />
    </div>
  );
}
