import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { AdminSidebar } from './admin-sidebar';
import { AdminProvider } from '@/lib/admin-context';
import { authAdminUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { AdminThemeProvider } from '@/components/admin-theme-provider';
import { EmpresaThemeProvider } from '@/components/empresa-theme-provider';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function getEmpresaIdFromRequest(): string | null {
  const referer = 'x-next-url';
  return null;
}

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;

  if (!token) {
    redirect('/admin/login');
  }

  const admin = await authAdminUseCase.verifyToken(token);

  if (!admin) {
    redirect('/admin/login');
  }

  let empresaId: string;
  let empresa = admin.empresa;
  let isSuperAdminView = false;

  if (admin.rol === SUPERADMIN_ROLE) {
    const cookieList = await cookies();
    const superadminEmpresaId = cookieList.get('superadmin_empresa_id')?.value;
    
    if (!superadminEmpresaId) {
      redirect('/superadmin');
    }
    empresaId = superadminEmpresaId;
    isSuperAdminView = true;
    const empresaResult = await empresaUseCase.getById(empresaId);
    if (empresaResult.success && empresaResult.data) {
      empresa = empresaResult.data as typeof empresa;
    }
  } else {
    empresaId = admin.empresaId!;
  }

  return (
    <AdminThemeProvider>
      <EmpresaThemeProvider colores={empresa?.colores ?? null}>
        <AdminProvider 
          empresaId={empresaId} 
          empresaNombre={empresa?.nombre ?? 'default'} 
          empresaLogo={empresa?.logoUrl ?? undefined}
          overrideEmpresaId={isSuperAdminView ? empresaId : undefined}
        >
          <div className="min-h-screen bg-muted">
            {isSuperAdminView && (
              <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-amber-50 to-amber-100/50 border-b border-amber-200 px-4 py-2">
                <div className="lg:ml-64 flex items-center justify-between">
                  <div className="text-sm text-amber-900 truncate">
                    Modo superadmin: Gestionando <strong className="font-semibold">{empresa?.nombre}</strong>
                  </div>
                  <a 
                    href="/superadmin" 
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-md transition-colors flex-shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6"/>
                    </svg>
                    Volver al panel
                  </a>
                </div>
              </div>
            )}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Saltar al contenido principal
            </a>
            <AdminSidebar empresaId={empresaId} />
            <main id="main-content" className="lg:ml-64 min-h-screen pt-10">
              {children}
            </main>
          </div>
        </AdminProvider>
      </EmpresaThemeProvider>
    </AdminThemeProvider>
  );
}
