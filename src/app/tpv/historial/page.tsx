import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { HistorialClient } from '@/components/tpv/HistorialClient';
import type { RolAdmin } from '@/core/domain/repositories/IAdminRepository';

export const dynamic = 'force-dynamic';

export default async function TpvHistorialPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ turnoId?: string }>;
}) {
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
  const { turnoId: turnoIdParam } = await searchParams;
  const supabase = getSupabaseClient();

  // Cargar los últimos 20 turnos para el selector
  const { data: turnosRaw } = await supabase
    .from('tpv_turnos')
    .select('id, operador_nombre, apertura_at, cierre_at')
    .eq('empresa_id', empresaId)
    .order('apertura_at', { ascending: false })
    .limit(20);

  type RawTurno = { id: string; operador_nombre: string; apertura_at: string; cierre_at: string | null };
  const turnos = ((turnosRaw ?? []) as RawTurno[]).map(t => ({
    id: t.id,
    operadorNombre: t.operador_nombre,
    aperturaAt: t.apertura_at,
    cierreAt: t.cierre_at,
    activo: t.cierre_at === null,
  }));

  if (turnos.length === 0) redirect('/tpv/turno/abrir');

  // Turno seleccionado: por param, si no el activo, si no el más reciente
  const turnoSeleccionado = turnoIdParam
    ? (turnos.find(t => t.id === turnoIdParam) ?? turnos[0])
    : (turnos.find(t => t.activo) ?? turnos[0]);

  const { data: empresaRow } = await supabase
    .from('empresas')
    .select('tipo_impuesto')
    .eq('id', empresaId)
    .maybeSingle();

  const tipoImpuesto = ((empresaRow as { tipo_impuesto: string | null } | null)?.tipo_impuesto as 'iva' | 'igic' | null) ?? 'iva';

  // Pedidos del turno seleccionado, delimitados por apertura y cierre
  const baseQuery = supabase
    .from('pedidos')
    .select('id, numero_pedido, total, estado, created_at, detalle_pedido, mesa_id, sesion_id, mesas(numero, nombre)')
    .eq('empresa_id', empresaId)
    .gte('created_at', turnoSeleccionado.aperturaAt)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: pedidos } = await (
    turnoSeleccionado.cierreAt
      ? baseQuery.lte('created_at', turnoSeleccionado.cierreAt)
      : baseQuery
  );

  type RawItem = { nombre?: string; cantidad?: number; precio?: number };
  type RawPedido = {
    id: string;
    numero_pedido: number;
    total: number;
    estado: string;
    created_at: string;
    detalle_pedido: RawItem[];
    mesa_id: string | null;
    sesion_id: string | null;
    mesas: { numero: number; nombre: string | null } | { numero: number; nombre: string | null }[] | null;
  };

  const rows = ((pedidos ?? []) as RawPedido[]).map(p => {
    const mesaRaw = Array.isArray(p.mesas) ? p.mesas[0] : p.mesas;
    return {
      id: p.id,
      numeroPedido: p.numero_pedido,
      total: Number(p.total),
      estado: p.estado,
      createdAt: p.created_at,
      mesaNumero: mesaRaw?.numero ?? null,
      mesaNombre: mesaRaw?.nombre ?? null,
      items: (p.detalle_pedido ?? []).map(it => ({
        nombre: it.nombre ?? '',
        cantidad: Number(it.cantidad ?? 1),
        precio: Number(it.precio ?? 0),
      })),
    };
  });

  type RawCobro = {
    id: string;
    serie: string;
    numero_ticket: number;
    metodo_pago: string;
    importe_cobrado_cents: number;
    propina_cents: number;
    iva_porcentaje: string;
    base_imponible_cents: number;
    iva_cents: number;
    hash: string;
    cobrado_at: string;
    rectifica_cobro_id: string | null;
    empleado_id: string | null;
  };

  const { data: cobrosRaw } = await supabase
    .from('tpv_cobros')
    .select('id, serie, numero_ticket, metodo_pago, importe_cobrado_cents, propina_cents, iva_porcentaje, base_imponible_cents, iva_cents, hash, cobrado_at, rectifica_cobro_id, empleado_id')
    .eq('turno_id', turnoSeleccionado.id)
    .order('numero_ticket', { ascending: false });

  const cobrosArray = (cobrosRaw ?? []) as RawCobro[];

  // Resolve employee names from empleados_tpv for cobros processed by a cajero/encargado
  const empleadoIds = [...new Set(cobrosArray.map(c => c.empleado_id).filter((id): id is string => id !== null))];
  const { data: empleadosRaw } = empleadoIds.length > 0
    ? await supabase
        .from('empleados_tpv')
        .select('id, nombre')
        .in('id', empleadoIds)
    : { data: [] };
  const empleadosMap = new Map(
    ((empleadosRaw ?? []) as { id: string; nombre: string }[]).map(e => [e.id, e.nombre])
  );

  const cobrosIds = cobrosArray.map(c => c.id);

  // IDs de cobros de ESTE turno referenciados por rectificativos de cualquier turno
  const { data: rectificativosDeEsteTurno } = cobrosIds.length > 0
    ? await supabase
        .from('tpv_cobros')
        .select('rectifica_cobro_id')
        .in('rectifica_cobro_id', cobrosIds)
    : { data: [] };

  const yaRectificadoSet = new Set(
    ((rectificativosDeEsteTurno ?? []) as { rectifica_cobro_id: string }[]).map(r => r.rectifica_cobro_id)
  );

  // Ticket original para rectificativos de este turno que apuntan a otro turno
  const rectificaIds = cobrosArray
    .filter(c => c.rectifica_cobro_id !== null && !cobrosIds.includes(c.rectifica_cobro_id!))
    .map(c => c.rectifica_cobro_id as string);

  const { data: originalesRaw } = rectificaIds.length > 0
    ? await supabase
        .from('tpv_cobros')
        .select('id, serie, numero_ticket')
        .in('id', rectificaIds)
    : { data: [] };

  const originalesMap = new Map(
    ((originalesRaw ?? []) as { id: string; serie: string; numero_ticket: number }[])
      .map(o => [o.id, { serie: o.serie, numeroTicket: o.numero_ticket }])
  );

  const cobros = cobrosArray.map(c => ({
    id: c.id,
    serie: c.serie,
    numeroTicket: c.numero_ticket,
    metodoPago: c.metodo_pago as 'efectivo' | 'tarjeta',
    importeCobradoCents: c.importe_cobrado_cents,
    propinaCents: c.propina_cents,
    ivaPorcentaje: Number(c.iva_porcentaje),
    baseImponibleCents: c.base_imponible_cents,
    ivaCents: c.iva_cents,
    hash: c.hash,
    cobradoAt: c.cobrado_at,
    rectificaCobroId: c.rectifica_cobro_id,
    yaRectificado: yaRectificadoSet.has(c.id),
    originalTicket: c.rectifica_cobro_id ? (originalesMap.get(c.rectifica_cobro_id) ?? null) : null,
    cajeroNombre: c.empleado_id ? (empleadosMap.get(c.empleado_id) ?? null) : null,
  }));

  return (
    <HistorialClient
      pedidos={rows}
      cobros={cobros}
      turnoAperturaAt={turnoSeleccionado.aperturaAt}
      tipoImpuesto={tipoImpuesto}
      turnos={turnos}
      turnoId={turnoSeleccionado.id}
    />
  );
}
