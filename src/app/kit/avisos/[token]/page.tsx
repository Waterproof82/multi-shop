// src/app/kit/avisos/[token]/page.tsx
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// M2b8b/R-M2b.3.1: página pública del enlace de gestión. NO cambia nada
// (el cargador solo consulta, D-M2b-5) y NO depende de ninguna bandera
// (D-M2b-8) — la revocación nunca puede quedar bloqueada por un flag.
// Sigue el mismo patrón que /kit/[serie] (DD3 de m2a/design.md): notFound()
// ANTES de cualquier JSX, sin loading.tsx (ver kit-avisos-page-guard.test.ts).
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cargarGestionAvisos } from "@/lib/kit-caducidad/cargar-gestion-avisos";
import { GestionAvisosKit } from "@/components/kit-publico/gestion-avisos-kit";

export const dynamic = "force-dynamic";

// R-M2b.3.1: noindex/nofollow y sin referrer — un escáner de correo no debe
// filtrar este token a ningún tercero vía la cabecera Referer.
export function generateMetadata(): Metadata {
  return {
    title: "Gestiona los avisos de tu kit",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

interface KitAvisosGestionPageProps {
  params: Promise<{ token: string }>;
}

export default async function KitAvisosGestionPage({ params }: Readonly<KitAvisosGestionPageProps>) {
  const { token } = await params;
  const resultado = await cargarGestionAvisos(token);

  if (resultado.tipo !== "ok") notFound();

  return (
    <main id="main-content" className="min-h-screen bg-background">
      <GestionAvisosKit token={token} serie={resultado.serie} estado={resultado.estado} />
    </main>
  );
}
