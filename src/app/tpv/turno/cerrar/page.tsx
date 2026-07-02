import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
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
  const statsResult = await repo.getTurnoStats(turno.id);
  const stats = statsResult.success ? statsResult.data : EMPTY_STATS;

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-[440px]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[#ef4444] uppercase tracking-wider">Cierre de Caja</span>
          <h1 className="text-2xl font-bold">Arqueo final</h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            Conta el efectivo en la caja. El sistema calculará la diferencia.
          </p>
        </div>
        <TurnoCerrarForm turno={turno} stats={stats} />
      </div>
    </div>
  );
}
