import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { getSupabaseClient } from '@/core/infrastructure/database/supabase-client';
import { TurnoCerrarForm } from '@/components/tpv/TurnoCerrarForm';

const EMPTY_STATS = { totalEfectivoCents: 0, totalTarjetaCents: 0, numOperaciones: 0 };

export default async function TurnoCerrarPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');
  if (!admin.empresaId) redirect('/admin/login');

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(admin.empresaId);
  if (!turnoResult.success || turnoResult.data === null) redirect('/tpv/turno/abrir');

  const turno = turnoResult.data;

  const supabase = getSupabaseClient();
  const [statsResult, sesionesRes] = await Promise.all([
    repo.getTurnoStats(turno.id),
    supabase
      .from('mesa_sesiones')
      .select('id, mesas!mesa_sesiones_mesa_id_fkey(numero, nombre)')
      .eq('empresa_id', admin.empresaId)
      .is('cerrada_at', null),
  ]);

  const stats = statsResult.success ? statsResult.data : EMPTY_STATS;

  type MesaJoin = { numero: number | null; nombre: string | null };
  type SesionRow = { id: string; mesas: MesaJoin | MesaJoin[] | null };
  const mesasAbiertas = ((sesionesRes.data ?? []) as unknown as SesionRow[]).map(s => {
    const mesa = Array.isArray(s.mesas) ? s.mesas[0] : s.mesas;
    return { mesaNumero: mesa?.numero ?? null, mesaNombre: mesa?.nombre ?? null };
  });

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-[440px]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[#ef4444] uppercase tracking-wider">Cierre de Caja</span>
          <h1 className="text-2xl font-bold">Arqueo final</h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            Cuenta el efectivo en la caja. El sistema calculará la diferencia.
          </p>
        </div>
        <TurnoCerrarForm turno={turno} stats={stats} mesasAbiertas={mesasAbiertas} />
      </div>
    </div>
  );
}
