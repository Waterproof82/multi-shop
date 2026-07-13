import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { AnalyticsClient } from '@/components/tpv/AnalyticsClient';
import type { TipoImpuesto } from '@/core/domain/entities/tpv-types';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

export const dynamic = 'force-dynamic';

export default async function TpvAnalyticsPage() {
  const cookieStore = await cookies();
  let empresaId: string | null = null;
  let userRol: RolAdmin = 'cajero';

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin?.empresa) {
      empresaId = admin.empresa.id;
      userRol = admin.rol;
    }
  }

  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
    userRol = payload.rol;
  }

  if (userRol === 'cajero') redirect('/tpv/mostrador');
  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);

  if (!turnoResult.success || !turnoResult.data) redirect('/tpv/turno/abrir');

  const today = new Date().toISOString().slice(0, 10);

  const [analyticsResult, empresaRes] = await Promise.all([
    repo.getAnalytics({ empresaId, desde: today, hasta: today }),
    getSupabaseClient()
      .from('empresas')
      .select('tipo_impuesto')
      .eq('id', empresaId)
      .maybeSingle(),
  ]);

  if (!analyticsResult.success) redirect('/tpv/mostrador');

  const tipoImpuesto = ((empresaRes.data as { tipo_impuesto: string } | null)?.tipo_impuesto as TipoImpuesto) ?? 'iva';

  return (
    <AnalyticsClient
      initialData={analyticsResult.data}
      tipoImpuesto={tipoImpuesto}
    />
  );
}
