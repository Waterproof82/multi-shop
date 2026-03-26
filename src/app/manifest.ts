import type { MetadataRoute } from "next";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getEmpresaByDomain } from "@/lib/server-services";

function getIconMimeType(url: string): string {
  if (url.endsWith('.png')) return 'image/png';
  if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg';
  if (url.endsWith('.svg')) return 'image/svg+xml';
  return 'image/webp';
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;

  const name = empresa?.nombre || "Mermelada de Tomate";
  const themeColor = empresa?.colores?.primary || "#000000";
  const backgroundColor = empresa?.colores?.background || "#ffffff";
  const iconType = empresa?.logoUrl ? getIconMimeType(empresa.logoUrl) : 'image/x-icon';

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
          { src: empresa.logoUrl, sizes: "any", type: iconType },
        ]
      : [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
  };
}
