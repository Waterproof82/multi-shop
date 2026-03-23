import { getMenuUseCase, getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
import { MenuPage } from "@/components/client-menu-page"
import SiteHeaderWrapper from "@/components/site-header-wrapper";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { logger } from "@/core/infrastructure/logging/logger";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const fullDomain = await getDomainFromHeaders();

  let empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;

  const subdomainConfig = empresa?.subdomainPedidos ?? 'pedidos';
  const isPedidos = isPedidosSubdomain(fullDomain, subdomainConfig);

  if (!empresa && isPedidos) {
    const mainDomain = extractMainDomain(fullDomain, subdomainConfig);
    empresa = await getEmpresaByDomain(mainDomain);
  }

  const empresaId = empresa?.id;

  if (!empresa && empresaId === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dominio no configurado</h1>
          <p className="text-muted-foreground">Esta web no está asociada a ninguna empresa.</p>
        </div>
      </div>
    );
  }

  const mostrarCarritoEmpresa = empresa?.mostrarCarrito ?? false;
  const showCart = isPedidos || mostrarCarritoEmpresa;

  let menuData: MenuCategoryVM[] = [];

  try {
    const menuResult = await getMenuUseCase.execute(empresaId!);
    if (menuResult.data) {
      menuData = menuResult.data;
    } else if (menuResult.error) {
      const errorMsg = typeof menuResult.error === 'string' 
        ? menuResult.error 
        : (menuResult.error as { message?: string }).message || 'Error fetching menu';
      logger.logError({
        codigo: 'MENU_FETCH_ERROR',
        mensaje: errorMsg,
        modulo: 'use-case',
        metodo: 'execute',
        severity: 'error',
      });
    }
  } catch (error) {
    logger.logFromCatch(error, 'use-case', 'execute');
  }

  const header = await SiteHeaderWrapper({ showCart, empresa });
  return (
    <EmpresaThemeProvider colores={empresa?.colores || null}>
      <MenuPage menuData={menuData} header={header} showCart={showCart} empresa={empresa} />
    </EmpresaThemeProvider>
  );
}
