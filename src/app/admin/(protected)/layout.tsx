import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AdminSidebar } from './admin-sidebar';
import { AdminProvider } from '@/lib/admin-context';
import { authAdminUseCase } from '@/core/infrastructure/database';
import { AdminThemeProvider } from '@/components/admin-theme-provider';
import { EmpresaThemeProvider } from '@/components/empresa-theme-provider';

export default async function AdminProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    redirect('/admin/login');
  }

  const empresa = admin.empresa;
  const empresaId = admin.empresaId;

  return (
    <AdminThemeProvider>
      <EmpresaThemeProvider colores={empresa?.colores || null}>
        <AdminProvider empresaId={empresaId} empresaNombre={empresa?.nombre || 'default'}>
          <div className="min-h-screen bg-muted">
            <AdminSidebar empresaId={empresaId} />
            <main className="lg:ml-64 min-h-screen">
              {children}
            </main>
          </div>
        </AdminProvider>
      </EmpresaThemeProvider>
    </AdminThemeProvider>
  );
}
