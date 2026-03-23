import type { MetadataRoute } from "next";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getEmpresaByDomain } from "@/lib/server-services";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;

  const name = empresa?.nombre || "Mermelada de Tomate";
  const themeColor = empresa?.colores?.primary || "#000000";
  const backgroundColor = empresa?.colores?.background || "#ffffff";

  return {
    name,
    short_name: name,
    description: empresa?.descripcion?.es || "Carta digital y pedidos",
    start_url: "/",
    display: "standalone",
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: empresa?.logoUrl
      ? [
          { src: empresa.logoUrl, sizes: "192x192", type: "image/webp" },
          { src: empresa.logoUrl, sizes: "512x512", type: "image/webp" },
        ]
      : [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
  };
}
