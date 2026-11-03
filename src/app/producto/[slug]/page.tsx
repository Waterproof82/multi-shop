import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { cargarPaginaProducto } from "@/lib/catalogo/cargar-producto";
import { buildProductPageMetadata } from "@/lib/seo/tenant-seo";
import { buildProductJsonLdGraph, safeJsonStringify } from "@/lib/seo/json-ld";
import { getEmpresaLegalUseCase } from "@/core/infrastructure/database";
import { getModalidadesEntregaPublicas } from "@/lib/server-services";
import { MIN_DESISTIMIENTO_DIAS } from "@/core/domain/legal/constantes";
import SiteHeaderWrapper from "@/components/site-header-wrapper";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { ProductDetailClient } from "@/components/producto/product-detail-client";

// Dinámica: el tenant depende del host (headers), no hay slugs enumerables
// en build time (design decisión #7, igual que /carta).
export const dynamic = 'force-dynamic';

interface ProductoPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Readonly<ProductoPageProps>): Promise<Metadata> {
  const { slug } = await params;
  const resultado = await cargarPaginaProducto(slug);
  if (resultado.tipo !== 'ok') return {};

  const resolvedParams = await searchParams;
  return buildProductPageMetadata({ empresa: resultado.empresa, item: resultado.item, langParam: resolvedParams.lang });
}

export default async function ProductoPage({ params }: Readonly<ProductoPageProps>) {
  const { slug } = await params;
  const resultado = await cargarPaginaProducto(slug);

  // notFound()/permanentRedirect() ANTES de cualquier JSX: un loading.tsx en
  // este árbol pintaría su fallback (200) antes de llegar aquí (F7) — por
  // eso esta ruta no tiene loading.tsx (ver producto-sin-loading.test.ts).
  if (resultado.tipo === 'redirigir') permanentRedirect(`/producto/${resultado.slug}`);
  if (resultado.tipo !== 'ok') notFound();

  const { empresa, isPedidos, item, baseUrl } = resultado;
  const showCart = isPedidos || empresa.mostrarCarrito;

  const [legalResult, modalidadesEntrega] = await Promise.all([
    getEmpresaLegalUseCase().getContext(empresa.id),
    getModalidadesEntregaPublicas(empresa.id),
  ]);
  const modalidadesDomicilio = legalResult.success ? legalResult.data.modalidadesDomicilio : [];
  const plazoDesistimientoDias = legalResult.success ? legalResult.data.legal.plazoDesistimientoDias : MIN_DESISTIMIENTO_DIAS;

  const jsonLd = safeJsonStringify(
    buildProductJsonLdGraph(item, empresa, baseUrl, modalidadesDomicilio, plazoDesistimientoDias)
  );
  const header = await SiteHeaderWrapper({ showCart, empresa });

  return (
    <EmpresaThemeProvider colores={empresa.colores || null}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <ProductDetailClient empresa={empresa} item={item} header={header} showCart={showCart} modalidadesEntrega={modalidadesEntrega} />
    </EmpresaThemeProvider>
  );
}
