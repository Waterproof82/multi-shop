import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthAdminUseCase } from '@/core/infrastructure/database';
import { verifyTpvEmployeeToken } from '@/lib/tpv-employee-auth';

const ALLOWED_ROLES = new Set(['admin', 'superadmin', 'encargado']);

export const dynamic = 'force-dynamic';

export default async function LaborControlLayout({ children }: { readonly children: React.ReactNode }) {
  const cookieStore = await cookies();

  // Try admin_token first
  const adminToken = cookieStore.get('admin_token')?.value;
  if (adminToken) {
    const admin = await getAuthAdminUseCase().verifyToken(adminToken);
    if (admin && ALLOWED_ROLES.has(admin.rol)) {
      return <>{children}</>;
    }
  }

  // Fallback to tpv_employee_token (encargado role only)
  const employeeToken = cookieStore.get('tpv_employee_token')?.value;
  if (employeeToken) {
    const payload = await verifyTpvEmployeeToken(employeeToken);
    if (payload && ALLOWED_ROLES.has(payload.rol)) {
      return <>{children}</>;
    }
  }

  redirect('/tpv/login');
}
