import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getEmpresaByDomain } from "@/lib/server-services";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;
  const title = empresa?.nombre || "Restaurante";

  return {
    title: `Página no encontrada - ${title}`,
    description: "La página que buscas no existe o ha sido movida. Vuelve al menú digital del restaurante.",
    robots: { index: false, follow: true },
  };
}

export default async function NotFound() {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;
  const nombre = empresa?.nombre || "Restaurante";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
        <p className="text-lg font-semibold text-foreground mb-2">
          Página no encontrada
        </p>
        <p className="text-muted-foreground mb-8">
          Lo sentimos, la página que buscas no existe o ha sido movida.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Volver al inicio
        </Link>
      </div>
      
      {empresa?.urlImage && (
        <div className="mt-8 opacity-60 grayscale">
          <Image
            src={empresa.urlImage}
            alt={nombre}
            width={96}
            height={48}
            className="max-h-20 object-contain mx-auto"
          />
        </div>
      )}
      
      <p className="mt-8 text-sm text-muted-foreground text-center">
        {nombre} - Carta digital
      </p>
    </div>
  );
}