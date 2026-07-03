import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { CobroFlow } from '@/components/tpv/cobro/CobroFlow';

export const dynamic = 'force-dynamic';

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
  const [sesionRes, pedidosRes, empresaRes, cobrosRes] = await Promise.all([
    supabase
      .from('mesa_sesiones')
      .select('id, propina_cents, mesas!mesa_sesiones_mesa_id_fkey(numero)')
      .eq('id', sesionId)
      .maybeSingle(),
    supabase
      .from('pedidos')
      .select('total')
      .eq('sesion_id', sesionId)
      .neq('estado', 'cancelado'),
    supabase
      .from('empresas')
      .select('nif, tipo_impuesto, porcentaje_impuesto')
      .eq('id', admin.empresaId)
      .maybeSingle(),
    supabase
      .from('tpv_cobros')
      .select('importe_cobrado_cents, rectifica_cobro_id')
      .eq('sesion_id', sesionId),
  ]);

  const sesion = sesionRes.data;
  if (!sesion) redirect('/tpv/mostrador');

  const sesionData = sesion as unknown as {
    id: string;
    propina_cents: number;
    mesas: { numero: number } | null;
  };

  // Sum pedidos total — mesa_sesiones.total only reflects what was already charged;
  // active sessions may have 0 there until the first cobro is registered.
  const pedidosTotal = ((pedidosRes.data ?? []) as { total: number }[])
    .reduce((sum, p) => sum + Number(p.total), 0);

  // Sum cobros previos (netting out rectificaciones) to support cobro parcial.
  type RawCobro = { importe_cobrado_cents: number; rectifica_cobro_id: string | null };
  const yaCobradoCents = ((cobrosRes.data ?? []) as RawCobro[])
    .reduce((sum, c) => sum + Number(c.importe_cobrado_cents), 0);

  const empresaRow = empresaRes.data as { nif: string | null; tipo_impuesto: string | null; porcentaje_impuesto: number | null } | null;
  const nif = empresaRow?.nif ?? null;
  const tipoImpuesto = (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';
  const porcentajeImpuesto = empresaRow?.porcentaje_impuesto ?? 10;

  return (
    <CobroFlow
      sesionId={sesionId}
      turnoId={turnoId}
      totalCents={Math.round(pedidosTotal * 100)}
      yaCobradoCents={yaCobradoCents}
      mesaNumero={sesionData.mesas?.numero ?? 0}
      operadorNombre={admin.nombreCompleto ?? 'Operador'}
      empresaNif={nif}
      tipoImpuesto={tipoImpuesto}
      porcentajeImpuesto={porcentajeImpuesto}
    />
  );
}
