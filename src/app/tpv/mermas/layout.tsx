import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';

export const dynamic = 'force-dynamic';

export default async function MermasLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();

  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await authAdminUseCase.verifyToken(adminToken);
    if (!admin) redirect('/tpv/login');
    if (admin.rol === 'cajero') redirect('/tpv/mostrador');
    return <>{children}</>;
  }

  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (employeeToken) {
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (!payload) redirect('/tpv/login');
    if (payload.rol === 'cajero') redirect('/tpv/mostrador');
    return <>{children}</>;
  }

  redirect('/tpv/login');
}
