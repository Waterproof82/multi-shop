import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase, productUseCase, categoryUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { MostradorClient } from '@/components/tpv/MostradorClient';
import type { ExistingOrder } from '@/components/tpv/MostradorClient';

export const dynamic = 'force-dynamic';

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

  const { mesaId, sesionId, mesaNumero } = await searchParams;

  const [productsResult, categoriesResult] = await Promise.all([
    productUseCase.getAll(admin.empresaId),
    categoryUseCase.getAll(admin.empresaId),
  ]);

  const products = productsResult.success ? productsResult.data : [];
  const categories = categoriesResult.success ? categoriesResult.data : [];

  // If a mesa was selected, load its existing orders from the DB
  let existingOrders: ExistingOrder[] = [];
  let mesaName: string | null = null;
  if (mesaId && sesionId) {
    try {
      const supabase = getSupabaseClient();
      const [ordersRows, mesaRow] = await Promise.all([
        supabase
          .from('pedidos')
          .select('id, numero_pedido, detalle_pedido, total, estado, created_at')
          .eq('sesion_id', sesionId)
          .neq('estado', 'cancelado')   // show all non-cancelled: pending, in kitchen, ready, served
          .order('created_at'),
        supabase
          .from('mesas')
          .select('nombre')
          .eq('id', mesaId)
          .maybeSingle(),
      ]);

      mesaName = (mesaRow.data as { nombre: string | null } | null)?.nombre ?? null;

      type RawItem = { nombre?: string; precio?: number; cantidad?: number; complementos?: string[] };
      type RawPedido = { id: string; numero_pedido: number; detalle_pedido: RawItem[]; total: number; estado: string; created_at: string };

      existingOrders = ((ordersRows.data ?? []) as RawPedido[]).map(p => ({
        id: p.id,
        numeroPedido: p.numero_pedido,
        estado: p.estado,
        items: (p.detalle_pedido ?? []).map(it => ({
          nombre: it.nombre ?? '',
          precio: Number(it.precio ?? 0),
          cantidad: Number(it.cantidad ?? 1),
          complementos: it.complementos ?? [],
        })),
        total: Number(p.total),
      }));
    } catch {
      // best-effort — mostrador still works without existing orders
    }
  }

  return (
    <MostradorClient
      turno={turnoResult.data}
      products={products}
      categories={categories}
      initialMesa={mesaId && sesionId ? {
        mesaId,
        sesionId,
        mesaNumero: mesaNumero ? parseInt(mesaNumero, 10) : null,
        mesaName,
        existingOrders,
      } : null}
    />
  );
}
