import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AdminSidebar } from './admin-sidebar';
import { AdminProvider } from '@/lib/admin-context';
import { authAdminUseCase, empresaUseCase } from '@/core/infrastructure/database';
import { AdminThemeProvider } from '@/components/admin-theme-provider';
import { EmpresaThemeProvider } from '@/components/empresa-theme-provider';
import { SUPERADMIN_ROLE } from '@/core/domain/repositories/IAdminRepository';
import { SuperadminBanner } from '@/components/superadmin-banner';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function getEmpresaIdFromRequest(): string | null {
  return null;
}

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

  let empresaId: string;
  let empresa = admin.empresa;
  let isSuperAdminView = false;
  let mostrarPromociones = empresa?.mostrarPromociones ?? true;
  let mostrarTgtg = empresa?.mostrarTgtg ?? true;

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
      empresa = empresaResult.data as unknown as typeof empresa;
      mostrarPromociones = empresaResult.data.mostrarPromociones ?? true;
      mostrarTgtg = empresaResult.data.mostrarTgtg ?? true;
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
          mostrarPromociones={mostrarPromociones}
          mostrarTgtg={mostrarTgtg}
          overrideEmpresaId={isSuperAdminView ? empresaId : undefined}
        >
          <div className="min-h-screen bg-muted">
            {isSuperAdminView && (
              <SuperadminBanner empresaNombre={empresa?.nombre ?? ''} />
            )}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              Saltar al contenido principal
            </a>
            <AdminSidebar empresaId={empresaId} />
            <main id="main-content" className={`lg:ml-64 min-h-screen ${isSuperAdminView ? 'pt-20' : 'pt-16'}`}>
              {children}
            </main>
          </div>
        </AdminProvider>
      </EmpresaThemeProvider>
    </AdminThemeProvider>
  );
}
