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
            {/* Skip to main content link for accessibility */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Saltar al contenido principal
            </a>
            <AdminSidebar empresaId={empresaId} />
            <main id="main-content" className="lg:ml-64 min-h-screen">
              {children}
            </main>
          </div>
        </AdminProvider>
      </EmpresaThemeProvider>
    </AdminThemeProvider>
  );
}
