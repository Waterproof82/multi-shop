import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { HistorialClient } from '@/components/tpv/HistorialClient';

export const dynamic = 'force-dynamic';

export default async function TpvHistorialPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);
  if (!admin || !admin.empresa) redirect('/admin/login');

  const empresaId = admin.empresa.id;
  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);

  if (!turnoResult.success || !turnoResult.data) redirect('/tpv/turno/abrir');

  const turno = turnoResult.data;
  const supabase = getSupabaseClient();

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('id, numero_pedido, total, estado, created_at, detalle_pedido, mesa_id, sesion_id, payment_status, mesas(numero, nombre)')
    .eq('empresa_id', empresaId)
    .gte('created_at', turno.aperturaAt)
    .order('created_at', { ascending: false })
    .limit(200);

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
    payment_status: string | null;
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
      paymentStatus: p.payment_status,
      mesaNumero: mesaRaw?.numero ?? null,
      mesaNombre: mesaRaw?.nombre ?? null,
      items: (p.detalle_pedido ?? []).map(it => ({
        nombre: it.nombre ?? '',
        cantidad: Number(it.cantidad ?? 1),
        precio: Number(it.precio ?? 0),
      })),
    };
  });

  const { data: cobrosRaw } = await supabase
    .from('tpv_cobros')
    .select('id, serie, numero_ticket, metodo_pago, importe_cobrado_cents, propina_cents, iva_porcentaje, base_imponible_cents, iva_cents, hash, cobrado_at, rectifica_cobro_id')
    .eq('turno_id', turno.id)
    .order('numero_ticket', { ascending: false });

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
  };

  const cobros = ((cobrosRaw ?? []) as RawCobro[]).map(c => ({
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
  }));

  return <HistorialClient pedidos={rows} cobros={cobros} turnoAperturaAt={turno.aperturaAt} />;
}
