import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { CobroFlow } from '@/components/tpv/cobro/CobroFlow';

interface Props {
  params: Promise<{ sesionId: string }>;
  searchParams: Promise<{ turnoId?: string }>;
}

export default async function CobroPage({ params, searchParams }: Readonly<Props>) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');

  const { sesionId } = await params;
  const { turnoId } = await searchParams;
  if (!turnoId) redirect('/tpv/mostrador');

  const supabase = getSupabaseClient();
  const [sesionRes, empresaRes] = await Promise.all([
    supabase
      .from('mesa_sesiones')
      .select('id, total, propina_cents, mesas(numero)')
      .eq('id', sesionId)
      .single(),
    supabase
      .from('empresas')
      .select('nif')
      .eq('id', admin.empresaId)
      .maybeSingle(),
  ]);

  const sesion = sesionRes.data;
  if (!sesion) redirect('/tpv/mostrador');

  const sesionData = sesion as unknown as {
    id: string;
    total: number;
    propina_cents: number;
    mesas: { numero: number } | null;
  };

  const nif = (empresaRes.data as { nif: string | null } | null)?.nif ?? null;

  return (
    <CobroFlow
      sesionId={sesionId}
      turnoId={turnoId}
      totalCents={Math.round(sesionData.total * 100)}
      mesaNumero={sesionData.mesas?.numero ?? 0}
      operadorNombre={admin.nombreCompleto ?? 'Operador'}
      empresaNif={nif}
    />
  );
}
