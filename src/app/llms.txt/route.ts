import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getCachedMenu, resolverEmpresaPublica } from "@/lib/server-services";
import { getLandingSeccionUseCase } from "@/core/infrastructure/database";
import { logger } from "@/core/infrastructure/logging/logger";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";
import type { LandingSeccion } from "@/core/domain/entities/types";

export const dynamic = "force-dynamic";

// GET /llms.txt — resumen del negocio para asistentes de IA (GEO). Ver
// src/lib/seo/llms-txt.ts. Un fallo de secciones o carta degrada el fichero
// (sin horario / sin carta), nunca lo tumba.
export async function GET(): Promise<Response> {
  const domain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(domain);
  if (!empresa) {
    return new Response("Not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  let secciones: LandingSeccion[] = [];
  const seccionesResult = await getLandingSeccionUseCase().getAll(empresa.id);
  if (seccionesResult.success) {
    secciones = seccionesResult.data.filter((s) => s.activo);
  } else {
    logger.logError({
      codigo: "LLMS_TXT_SECCIONES_ERROR",
      mensaje: seccionesResult.error.message,
      modulo: "use-case",
      metodo: "llms.txt",
      severity: "warning",
    });
  }

  let menu: MenuCategoryVM[] = [];
  const menuResult = await getCachedMenu(empresa.id);
  if (menuResult.data) menu = menuResult.data;

  const baseUrl = `https://${domain}`;
  return new Response(buildLlmsTxt({ empresa, secciones, menu, baseUrl }), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
