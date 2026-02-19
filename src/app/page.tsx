import { getMenuUseCase, getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
import { MenuPage } from "@/components/client-menu-page"
import SiteHeaderWrapper from "@/components/site-header-wrapper";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getDomainFromHeaders(): Promise<string> {
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    if (!host) return '';
    const domainWithPort = host.replace(/^www\./, '').toLowerCase();
    return domainWithPort.split(':')[0];
  } catch (e) {
    return '';
  }
}

export default async function Home() {
  const fullDomain = await getDomainFromHeaders();
  
  let empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;
  
  const subdomainConfig = empresa?.subdomainPedidos ?? 'pedidos';
  const isPedidos = isPedidosSubdomain(fullDomain, subdomainConfig);
  
  if (!empresa && isPedidos) {
    const mainDomain = extractMainDomain(fullDomain, subdomainConfig);
    empresa = await getEmpresaByDomain(mainDomain);
  }
  
  const empresaId = empresa?.id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || "demo-empresa-id";
  const mostrarCarritoEmpresa = empresa?.mostrarCarrito ?? false;
  
  const showCart = isPedidos || mostrarCarritoEmpresa;
  
  let menuData: MenuCategoryVM[] = [];

  try {
    menuData = await getMenuUseCase.execute(empresaId);
  } catch (error) {
    console.error("Error fetching menu from Supabase:", error);
  }

  const header = await SiteHeaderWrapper({ showCart });
  return <MenuPage menuData={menuData} header={header} showCart={showCart} />;
}
