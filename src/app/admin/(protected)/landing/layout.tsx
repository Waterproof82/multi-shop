import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAuthAdminUseCase, getEmpresaUseCase } from '@/core/infrastructure/database';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';

// Con la landing desactivada desde superadmin, "/" redirige a la carta y el
// link ya no sale en el sidebar; esto cierra también el acceso por URL.
// Auth y redirects a login los resuelve el layout padre: aquí, ante cualquier
// dato que falte, no se bloquea (mismo default `true` que el sidebar).
async function landingHabilitadaParaAdminActual(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return true;

  const admin = await getAuthAdminUseCase().verifyToken(token);
  if (!admin) return true;

  if (admin.rol !== SUPERADMIN_ROLE) return admin.empresa?.landingHabilitada ?? true;

  const empresaId = cookieStore.get('superadmin_empresa_id')?.value;
  if (!empresaId) return true;
  const result = await getEmpresaUseCase().getById(empresaId);
  if (!result.success || !result.data) return true;
  return result.data.landingHabilitada ?? true;
}

export default async function LandingAdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  if (!(await landingHabilitadaParaAdminActual())) {
    redirect('/admin');
  }
  return children;
}
