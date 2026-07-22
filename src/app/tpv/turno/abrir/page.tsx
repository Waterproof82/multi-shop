import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { SupabaseTpvRepository } from '@/core/infrastructure/repositories/supabase-tpv.repository';
import { TurnoAbrirForm } from '@/components/tpv/TurnoAbrirForm';

export default async function TurnoAbrirPage() {
  const cookieStore = await cookies();

  let empresaId: string | null = null;
  let defaultOperador = '';

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin?.empresaId) {
      empresaId = admin.empresaId;
      defaultOperador = admin.nombreCompleto ?? '';
    }
  }

  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
    defaultOperador = payload.nombre;

    // Only encargado can open a turno
    if (payload.rol === 'cajero') redirect('/tpv/mostrador');
  }

  if (!empresaId) redirect('/tpv/login');

  const repo = new SupabaseTpvRepository();
  const turnoResult = await repo.findTurnoActivo(empresaId);
  if (turnoResult.success && turnoResult.data !== null) redirect('/tpv/mostrador');

  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-12 flex flex-col gap-8 w-[440px] shadow-sm">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-[#2563eb] uppercase tracking-wider">TPV</span>
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
