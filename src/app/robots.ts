import type { MetadataRoute } from "next";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { CRAWLERS_IA_BUSQUEDA, CRAWLERS_IA_ENTRENAMIENTO } from "@/lib/seo/crawlers-ia";

// Zonas privadas o efimeras: paneles internos, API, sesiones de mesa y
// resultados de pago. Solo `/`, `/carta` y `/privacidad` son indexables.
const DISALLOW_PATHS = [
  "/admin/",
  "/api/",
  "/superadmin/",
  "/waiter/",
  "/kitchen/",
  "/tpv/",
  "/laborcontrol/",
  "/mesa/",
  "/pedido/",
  "/tracking/",
  // `?mesa=` convierte `/` y `/carta` en la carta de una mesa concreta.
  "/*?mesa=",
  "/*&mesa=",
  // `?carrito=abierto` (FAB de la landing) solo abre el carrito: estado de UI.
  "/*?carrito=",
  "/*&carrito=",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const domain = await getDomainFromHeaders();
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW_PATHS,
      },
      // GEO: asistentes de IA, con las mismas zonas privadas (un grupo propio
      // sustituye al de `*`). Ver src/lib/seo/crawlers-ia.ts.
      {
        userAgent: [...CRAWLERS_IA_BUSQUEDA, ...CRAWLERS_IA_ENTRENAMIENTO],
        allow: ["/", "/llms.txt"],
        disallow: DISALLOW_PATHS,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
