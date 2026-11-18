// src/app/kit/[serie]/page.tsx
// kit-expiry-m2a (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2a/)
// Página pública del QR 1 de la etiqueta. Sigue el patrón de /producto/[slug]
// (design.md): llama al cargador, traduce 'no-encontrado' en notFound() real,
// y pinta el componente de servidor dentro del tema del tenant (DD11 — sin
// SiteHeaderWrapper: evita el carrito y una acción que compita, R-M2a.2.6).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cargarEstadoKitPublico } from "@/lib/kit-caducidad/cargar-estado-publico";
import { EmpresaThemeProvider } from "@/components/empresa-theme-provider";
import { EstadoKitPublico } from "@/components/kit-publico/estado-kit-publico";

// R-M2a.3.2: nada de unstable_cache ni otra caché compartida de datos por
// serie — el tenant depende del host y la serie es de un solo cliente.
export const dynamic = "force-dynamic";

// R-M2a.3.1: robots noindex/nofollow fijos, sin OG ni canonical, y SIN
// depender del resultado del cargador — el título nunca lleva la serie.
export function generateMetadata(): Metadata {
  return {
    title: "Estado de tu kit de emergencia",
    robots: { index: false, follow: false },
  };
}

interface KitPublicoPageProps {
  params: Promise<{ serie: string }>;
}

export default async function KitPublicoPage({ params }: Readonly<KitPublicoPageProps>) {
  const { serie } = await params;
  const resultado = await cargarEstadoKitPublico(serie);

  // notFound() ANTES de cualquier JSX: un loading.tsx en este árbol pintaría
  // su fallback (200) antes de llegar aquí — por eso esta ruta no lo tiene
  // (ver tests/core/kit-publico-page-guard.test.ts, bloque "sin loading.tsx").
  if (resultado.tipo !== "ok") notFound();

  const { empresa, estado } = resultado;

  return (
    <EmpresaThemeProvider colores={empresa.colores || null}>
      <main id="main-content" className="min-h-screen bg-background">
        <EstadoKitPublico estado={estado} />
      </main>
    </EmpresaThemeProvider>
  );
}
