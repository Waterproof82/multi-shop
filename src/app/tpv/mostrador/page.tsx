import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase, productUseCase, categoryUseCase, mesaSesionUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { MostradorClient } from '@/components/tpv/MostradorClient';
import type { ExistingOrder } from '@/components/tpv/MostradorClient';

export const dynamic = 'force-dynamic';

type RawComplement = string | { nombre?: string; name?: string };
type RawItem = { nombre?: string; precio?: number; cantidad?: number; complementos?: RawComplement[] };
type RawPedido = { id: string; numero_pedido: number; detalle_pedido: RawItem[]; total: number; estado: string; nota?: string | null; pase?: string | null; created_at: string };

function normComplement(c: RawComplement): string {
  return typeof c === 'string' ? c : (c.nombre ?? c.name ?? '');
}

function mapPedido(p: RawPedido): ExistingOrder {
  return {
    id: p.id,
    numeroPedido: p.numero_pedido,
    estado: p.estado,
    items: (p.detalle_pedido ?? []).map(it => ({
      nombre: it.nombre ?? '',
      precio: Number(it.precio ?? 0),
      cantidad: Number(it.cantidad ?? 1),
      complementos: (it.complementos ?? []).map(normComplement).filter(Boolean),
    })),
    total: Number(p.total),
    nota: p.nota ?? null,
    pase: p.pase ?? null,
  };
}

interface MesaData {
  existingOrders: ExistingOrder[];
  mesaName: string | null;
  sesionId: string | null;
  sesionPagada: boolean;
}

async function loadMesaData(mesaId: string, sesionIdParam: string | null): Promise<MesaData> {
  try {
    const supabase = getSupabaseClient();
    let sesionId = sesionIdParam;
    let sesionPagada = false;

    if (!sesionId) {
      const { data: sesionRow } = await supabase
        .from('mesa_sesiones')
        .select('id, sesion_pagada')
        .eq('mesa_id', mesaId)
        .is('cerrada_at', null)
        .maybeSingle();
      sesionId = (sesionRow as { id: string; sesion_pagada: boolean } | null)?.id ?? null;
      sesionPagada = (sesionRow as { id: string; sesion_pagada: boolean } | null)?.sesion_pagada ?? false;
    } else {
      const { data: sesionRow } = await supabase
        .from('mesa_sesiones')
        .select('sesion_pagada')
        .eq('id', sesionId)
        .maybeSingle();
      sesionPagada = (sesionRow as { sesion_pagada: boolean } | null)?.sesion_pagada ?? false;
    }

    if (!sesionId) return { existingOrders: [], mesaName: null, sesionId: null, sesionPagada };

    const [ordersRows, mesaRow] = await Promise.all([
      supabase
        .from('pedidos')
        .select('id, numero_pedido, detalle_pedido, total, estado, nota, pase, created_at')
        .eq('sesion_id', sesionId)
        .neq('estado', 'cancelado')
        .order('created_at'),
      supabase
        .from('mesas')
        .select('nombre')
        .eq('id', mesaId)
        .maybeSingle(),
    ]);

    const mesaName = (mesaRow.data as { nombre: string | null } | null)?.nombre ?? null;
    const existingOrders = ((ordersRows.data ?? []) as RawPedido[]).map(mapPedido);

    return { existingOrders, mesaName, sesionId, sesionPagada };
  } catch {
    return { existingOrders: [], mesaName: null, sesionId: sesionIdParam, sesionPagada: false };
  }
}

export default async function MostradorPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ mesaId?: string; sesionId?: string; mesaNumero?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');
  if (!admin.empresaId) redirect('/admin/login');

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(admin.empresaId);

  if (!turnoResult.success || turnoResult.data === null) {
    redirect('/tpv/turno/abrir');
  }

  const { mesaId, sesionId: sesionIdParam, mesaNumero } = await searchParams;

  const supabaseForEmpresa = getSupabaseClient();
  const empresaRes = await supabaseForEmpresa
    .from('empresas')
    .select('tipo_impuesto, porcentaje_impuesto')
    .eq('id', admin.empresaId)
    .maybeSingle();
  const empresaRow = empresaRes.data as { tipo_impuesto: string | null; porcentaje_impuesto: number | null } | null;
  const tipoImpuesto = (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';
  const porcentajeImpuesto = empresaRow?.porcentaje_impuesto ?? 10;

  const mesasPromise = mesaId
    ? Promise.resolve(null)
    : mesaSesionUseCase.getMesasWithSessions(admin.empresaId);

  const [productsResult, categoriesResult, mesasResult] = await Promise.all([
    productUseCase.getAll(admin.empresaId),
    categoryUseCase.getAll(admin.empresaId),
    mesasPromise,
  ]);

  const products = productsResult.success ? productsResult.data : [];
  const categories = categoriesResult.success ? categoriesResult.data : [];
  const mesas = mesasResult && mesasResult.success ? mesasResult.data : null;

  const mesaData = mesaId
    ? await loadMesaData(mesaId, sesionIdParam ?? null)
    : { existingOrders: [], mesaName: null, sesionId: null, sesionPagada: false };

  return (
    <MostradorClient
      key={mesaId ?? 'no-mesa'}
      turno={turnoResult.data}
      products={products}
      categories={categories}
      tipoImpuesto={tipoImpuesto}
      porcentajeImpuesto={porcentajeImpuesto}
      mesas={mesas}
      initialMesa={mesaId ? {
        mesaId,
        sesionId: mesaData.sesionId,
        mesaNumero: mesaNumero ? Number.parseInt(mesaNumero, 10) : null,
        mesaName: mesaData.mesaName,
        existingOrders: mesaData.existingOrders,
        sesionPagada: mesaData.sesionPagada,
      } : null}
    />
  );
}
