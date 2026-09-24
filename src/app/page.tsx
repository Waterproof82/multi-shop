import { getEmpresaByDomain, isPedidosSubdomain, extractMainDomain } from "@/lib/server-services"
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { LandingPage } from "@/components/landing-page";
import { CartaRoute } from "@/components/carta-route";
import { shouldBypassLanding } from "@/lib/landing/should-bypass-landing";
import { cookies } from "next/headers";

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: Readonly<HomeProps>) {
  const resolvedParams = await searchParams;
  const hasMesaParam = typeof resolvedParams.mesa === 'string' && resolvedParams.mesa.length > 0;
  const cookieStore = await cookies();
  const isWaiterMode = !!cookieStore.get('waiter_token')?.value;
  const fullDomain = await getDomainFromHeaders();

  let empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;

  const subdomainConfig = empresa?.subdomainPedidos ?? 'pedidos';
  const isPedidos = isPedidosSubdomain(fullDomain, subdomainConfig);

  if (!empresa && isPedidos) {
    const mainDomain = extractMainDomain(fullDomain, subdomainConfig);
    empresa = await getEmpresaByDomain(mainDomain);
  }

  if (!empresa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dominio no configurado</h1>
          <p className="text-muted-foreground">Esta web no está asociada a ninguna empresa.</p>
        </div>
      </div>
    );
  }

  const bypass = shouldBypassLanding({
    hasMesaParam,
    isWaiterMode,
    isPedidosSubdomain: isPedidos,
  });

  if (bypass) {
    return <CartaRoute searchParams={searchParams} />;
  }

  return (
    <EmpresaThemeProvider colores={empresa.colores}>
      <LandingPage empresa={empresa} />
    </EmpresaThemeProvider>
  );
}
