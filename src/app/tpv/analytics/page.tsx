import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { AnalyticsClient } from '@/components/tpv/AnalyticsClient';
import type { TipoImpuesto } from '@/core/domain/entities/tpv-types';

export const dynamic = 'force-dynamic';

export default async function TpvAnalyticsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);
  if (!admin || !admin.empresa) redirect('/admin/login');

  if (admin.rol === 'cajero') redirect('/tpv/mostrador');

  const empresaId = admin.empresa.id;
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
