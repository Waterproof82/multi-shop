import type { Metadata } from "next";
import { ImagenSubida as Image } from '../components/ui/imagen-subida';
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getEmpresaByDomain } from "@/lib/server-services";
import { NotFoundContent, NotFoundFooter } from "./not-found-content";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;
  const title = empresa?.nombre || "Restaurante";

  return {
    title: { absolute: `Página no encontrada · ${title}` },
    description: "La página que buscas no existe o ha sido movida. Vuelve al menú digital del restaurante.",
    robots: { index: false, follow: true },
  };
}

export default async function NotFound() {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;
  const nombre = empresa?.nombre || "Restaurante";

  return (
    <main id="main-content" className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <NotFoundContent />
      
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
      
      <NotFoundFooter nombre={nombre} />
    </main>
  );
}