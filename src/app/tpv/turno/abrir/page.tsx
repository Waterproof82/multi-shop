import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { TurnoAbrirForm } from '@/components/tpv/TurnoAbrirForm';

export default async function TurnoAbrirPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) redirect('/admin/login');

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) redirect('/admin/login');
  if (!admin.empresaId) redirect('/admin/login');

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(admin.empresaId);
  if (turnoResult.success && turnoResult.data !== null) redirect('/tpv/mostrador');

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-[#1a1d27] border border-[#2e3347] rounded-2xl p-12 flex flex-col gap-8 w-[440px]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[#4f72ff] uppercase tracking-wider">TPV</span>
          <h1 className="text-2xl font-bold">¿Quién está a cargo hoy?</h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            Este nombre quedará registrado en el turno de caja y en todas las operaciones.
          </p>
        </div>
        <TurnoAbrirForm />
      </div>
    </div>
  );
}
