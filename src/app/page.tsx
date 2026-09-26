import { resolverEmpresaPublica } from "@/lib/server-services"
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getLandingSeccionUseCase } from "@/core/infrastructure/database";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { LandingPage } from "@/components/landing-page";
import { CartaRoute } from "@/components/carta-route";
import { JsonLd } from "@/components/json-ld";
import { shouldBypassLanding } from "@/lib/landing/should-bypass-landing";
import { logger } from "@/core/infrastructure/logging/logger";
import { cookies } from "next/headers";
import { buildTenantPageMetadata, debeDesindexar } from "@/lib/seo/tenant-seo";
import { t } from "@/lib/translations";
import type { Metadata } from "next";
import type { LandingSeccion } from "@/core/domain/entities/types";

export const dynamic = 'force-dynamic';

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Readonly<HomeProps>): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const { empresa, isPedidos } = await resolverEmpresaPublica(await getDomainFromHeaders());
  if (!empresa) return {};

  // `?mesa=` / `?carrito=` son URLs efimeras (ver debeDesindexar). En el
  // subdominio de pedidos, `/` es la carta: se titula como tal.
  return buildTenantPageMetadata({
    empresa,
    path: "/",
    langParam: resolvedParams.lang,
    titulo: isPedidos ? (lang) => t("nuestraCarta", lang) : undefined,
    noIndex: debeDesindexar(resolvedParams),
  });
}

export default async function Home({ searchParams }: Readonly<HomeProps>) {
  const resolvedParams = await searchParams;
  const hasMesaParam = typeof resolvedParams.mesa === 'string' && resolvedParams.mesa.length > 0;
  const cookieStore = await cookies();
  const isWaiterMode = !!cookieStore.get('waiter_token')?.value;
  const fullDomain = await getDomainFromHeaders();

  const { empresa, isPedidos } = await resolverEmpresaPublica(fullDomain);

  if (!empresa) {
    return (
      <main id="main-content" className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Dominio no configurado</h1>
          <p className="text-muted-foreground">Esta web no está asociada a ninguna empresa.</p>
        </div>
      </main>
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

  const baseUrl = fullDomain ? `https://${fullDomain}` : "https://localhost:3000";

  let sections: LandingSeccion[] = [];
  try {
    const seccionesResult = await getLandingSeccionUseCase().getAll(empresa.id);
    if (seccionesResult.success) {
      sections = seccionesResult.data.filter((seccion) => seccion.activo);
    } else {
      logger.logError({
        codigo: 'LANDING_SECCIONES_FETCH_ERROR',
        mensaje: seccionesResult.error.message,
        modulo: 'use-case',
        metodo: 'execute',
        severity: 'error',
      });
    }
  } catch (error) {
    logger.logFromCatch(error, 'use-case', 'execute');
  }

  return (
    <EmpresaThemeProvider colores={empresa.colores}>
      <JsonLd empresa={empresa} menuData={[]} baseUrl={baseUrl} />
      <LandingPage empresa={empresa} sections={sections} />
    </EmpresaThemeProvider>
  );
}
