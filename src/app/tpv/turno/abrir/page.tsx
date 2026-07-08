import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { TurnoAbrirForm } from '@/components/tpv/TurnoAbrirForm';

export default async function TurnoAbrirPage() {
  const cookieStore = await cookies();

  let empresaId: string | null = null;
  let defaultOperador = '';

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (!admin || !admin.empresaId) redirect('/admin/login');
    empresaId = admin.empresaId;
  } else {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
    defaultOperador = payload.nombre;

    // Only encargado can open a turno
    if (payload.rol !== 'encargado') redirect('/tpv/mostrador');
  }

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);
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
        <TurnoAbrirForm defaultOperador={defaultOperador} />
      </div>
    </div>
  );
}
