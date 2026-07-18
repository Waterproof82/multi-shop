import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getAuthAdminUseCase, getAnalyticsUseCase, getEmpresaUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';
import { CierreReportView } from './cierre-report-view';

export default async function CierreTurnoPage({
  params,
}: {
  params: Promise<{ turnoId: string }>;
}) {
  const cookieStore = await cookies();
  const { turnoId } = await params;

  let empresaId: string | null = null;

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin?.empresaId) {
      empresaId = admin.empresaId;
    }
  }

  if (!empresaId) {
    const employeeToken = cookieStore.get('tpv_employee_token')?.value;
    if (!employeeToken) redirect('/tpv/login');
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    empresaId = payload.empresaId;
  }

  if (!empresaId) redirect('/tpv/login');

  const [reportResult, empresaResult] = await Promise.all([
    getAnalyticsUseCase().getCierreReporte(turnoId),
    getEmpresaUseCase().getById(empresaId),
  ]);

  if (!reportResult.success) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-screen bg-[#0f1117] text-white">
        <p className="text-red-400">No se pudo cargar el informe de cierre.</p>
        <Link
          href="/tpv/turno/abrir"
          className="px-4 py-2 rounded-lg bg-[#22263a] border border-[#2e3347] text-slate-300 text-sm font-medium hover:text-white transition-colors"
        >
          Volver al TPV
        </Link>
      </div>
    );
  }

  const empresaNombre =
    empresaResult.success && empresaResult.data
      ? ((empresaResult.data as { nombre?: string }).nombre ?? 'Empresa')
      : 'Empresa';

  return <CierreReportView report={reportResult.data} empresaNombre={empresaNombre} />;
}
