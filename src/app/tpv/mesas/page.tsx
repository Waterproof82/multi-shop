import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase, mesaSesionUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { MesasGrid } from '@/components/tpv/MesasGrid';

export const dynamic = 'force-dynamic';

export default async function TpvMesasPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ seleccionar?: string }>;
}) {
  const cookieStore = await cookies();
  let empresaId: string | null = null;

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (admin?.empresa) empresaId = admin.empresa.id;
  }

  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
  }

  if (!empresaId) redirect('/tpv/login');
  const { seleccionar } = await searchParams;
  const modo = seleccionar === '1' ? 'seleccionar' : 'cobrar';

  const [mesasResult, { data: turno }] = await Promise.all([
    mesaSesionUseCase.getMesasWithSessions(empresaId),
    getSupabaseClient()
      .from('tpv_turnos')
      .select('id')
      .eq('empresa_id', empresaId)
      .is('cierre_at', null)
      .maybeSingle(),
  ]);

  return (
    <MesasGrid
      mesas={mesasResult.success ? mesasResult.data : []}
      turnoId={turno?.id ?? null}
      modo={modo}
    />
  );
}
