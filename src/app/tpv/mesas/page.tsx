import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase, mesaSesionUseCase } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { MesasGrid } from '@/components/tpv/MesasGrid';

export const dynamic = 'force-dynamic';

export default async function TpvMesasPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ seleccionar?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);
  if (!admin || !admin.empresa) redirect('/admin/login');

  const empresaId = admin.empresa.id;
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
