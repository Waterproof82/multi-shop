import { CartaRoute } from "@/components/carta-route";
import { resolverEmpresaPublica } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { buildTenantPageMetadata } from "@/lib/seo/tenant-seo";
import { t } from "@/lib/translations";
import type { Metadata } from "next";

export const dynamic = 'force-dynamic';

interface CartaPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ searchParams }: Readonly<CartaPageProps>): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const { empresa } = await resolverEmpresaPublica(await getDomainFromHeaders());
  if (!empresa) return {};

  const hasMesaParam = typeof resolvedParams.mesa === 'string' && resolvedParams.mesa.length > 0;
  return buildTenantPageMetadata({
    empresa,
    path: "/carta",
    langParam: resolvedParams.lang,
    titulo: (lang) => t("nuestraCarta", lang),
    noIndex: hasMesaParam,
  });
}

export default async function CartaPage({ searchParams }: Readonly<CartaPageProps>) {
  return <CartaRoute searchParams={searchParams} desdeRutaCarta />;
}
