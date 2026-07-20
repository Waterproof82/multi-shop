import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { CobroFlow } from '@/components/tpv/cobro/CobroFlow';
import { type TpvDetalleItem } from '@/core/domain/entities/tpv-types';
import { resolveImpuestoPorcentaje } from '@/lib/tpv/impuesto';

export const dynamic = 'force-dynamic';

interface RawPedidoForDetalle {
  total: number;
  detalle_pedido?: Array<{
    nombre?: string | null;
    precio?: number | null;
    cantidad?: number | null;
    producto_id?: string | null;
  }> | null;
}

function buildDetalleItemsSSR(
  pedidos: RawPedidoForDetalle[],
  overrideMap: Map<string, number | null>,
  empresaPorcentaje: number,
): TpvDetalleItem[] {
  const map = new Map<string, TpvDetalleItem>();
  for (const pedido of pedidos) {
    for (const item of pedido.detalle_pedido ?? []) {
      const nombre = item.nombre ?? '';
      const precioUnitarioCents = Math.round((item.precio ?? 0) * 100);
      const override = item.producto_id ? (overrideMap.get(item.producto_id) ?? null) : null;
      const ivaPorcentaje = resolveImpuestoPorcentaje(override, empresaPorcentaje);
      const key = `${nombre}|${precioUnitarioCents}|${ivaPorcentaje}`;
      const prev = map.get(key);
      map.set(key, {
        nombre,
        precioUnitarioCents,
        ivaPorcentaje,
        cantidad: (prev?.cantidad ?? 0) + (item.cantidad ?? 1),
      });
    }
  }
  return Array.from(map.values());
}

interface Props {
  params: Promise<{ sesionId: string }>;
  searchParams: Promise<{ turnoId?: string }>;
}

export default async function CobroPage({ params, searchParams }: Readonly<Props>) {
  const cookieStore = await cookies();
  let empresaId: string | null = null;
  let operadorNombre = 'Operador';

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin?.empresaId) {
      empresaId = admin.empresaId;
      operadorNombre = admin.nombreCompleto ?? 'Operador';
    }
  }

  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
    operadorNombre = payload.nombre;
  }

  if (!empresaId) redirect('/tpv/login');

  const { sesionId } = await params;
  const { turnoId } = await searchParams;
  if (!turnoId) redirect('/tpv/mostrador');

  const supabase = getSupabaseClient();
  const [sesionRes, pedidosRes, empresaRes, cobrosRes] = await Promise.all([
    supabase
      .from('mesa_sesiones')
      .select('id, mesa_id, propina_cents, mesas!mesa_sesiones_mesa_id_fkey(numero)')
      .eq('id', sesionId)
      .maybeSingle(),
    supabase
      .from('pedidos')
      .select('total, detalle_pedido')
      .eq('sesion_id', sesionId)
      .neq('estado', 'cancelado'),
    supabase
      .from('empresas')
      .select('nombre, nif, tipo_impuesto, porcentaje_impuesto, razon_social')
      .eq('id', empresaId)
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
    mesa_id: string | null;
    propina_cents: number;
    mesas: { numero: number } | null;
  };

  const rawPedidos = (pedidosRes.data ?? []) as RawPedidoForDetalle[];

  // Sum pedidos total — mesa_sesiones.total only reflects what was already charged;
  // active sessions may have 0 there until the first cobro is registered.
  const pedidosTotal = rawPedidos.reduce((sum, p) => sum + Number(p.total), 0);

  // Sum cobros previos (netting out rectificaciones) to support cobro parcial.
  type RawCobro = { importe_cobrado_cents: number; rectifica_cobro_id: string | null };
  const yaCobradoCents = ((cobrosRes.data ?? []) as RawCobro[])
    .reduce((sum, c) => sum + Number(c.importe_cobrado_cents), 0);

  const empresaRow = empresaRes.data as {
    nombre: string | null;
    nif: string | null;
    tipo_impuesto: string | null;
    porcentaje_impuesto: number | null;
    razon_social: string | null;
  } | null;
  const empresaNombre = empresaRow?.nombre ?? 'Empresa';
  const nif = empresaRow?.nif ?? null;
  const empresaRazonSocial = empresaRow?.razon_social ?? null;
  const tipoImpuesto = (empresaRow?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';
  const porcentajeImpuesto = empresaRow?.porcentaje_impuesto ?? 10;

  // Resolve per-item tax rates from product overrides
  const productoIds = [...new Set(
    rawPedidos
      .flatMap(p => (p.detalle_pedido ?? []).map(i => i.producto_id))
      .filter((id): id is string => Boolean(id)),
  )];

  const overrideMap = new Map<string, number | null>();
  if (productoIds.length > 0) {
    const { data: productosData } = await supabase
      .from('productos')
      .select('id, porcentaje_impuesto_override')
      .in('id', productoIds);
    for (const p of (productosData ?? []) as { id: string; porcentaje_impuesto_override: number | null }[]) {
      overrideMap.set(p.id, p.porcentaje_impuesto_override ?? null);
    }
  }

  const detalleItems = buildDetalleItemsSSR(rawPedidos, overrideMap, porcentajeImpuesto);

  return (
    <CobroFlow
      sesionId={sesionId}
      turnoId={turnoId}
      totalCents={Math.round(pedidosTotal * 100)}
      yaCobradoCents={yaCobradoCents}
      mesaId={sesionData.mesa_id ?? undefined}
      mesaNumero={sesionData.mesas?.numero ?? 0}
      operadorNombre={operadorNombre}
      empresaId={empresaId}
      empresaNombre={empresaNombre}
      empresaNif={nif}
      empresaRazonSocial={empresaRazonSocial}
      tipoImpuesto={tipoImpuesto}
      porcentajeImpuesto={porcentajeImpuesto}
      detalleItems={detalleItems}
    />
  );
}
