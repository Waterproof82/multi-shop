import "server-only";
import { cache } from "react";
import { getCachedMenu, resolverEmpresaPublica } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { findMenuItemBySlug } from "@/lib/catalogo/productos-publicos";
import { getSlugHistoricoUseCase } from "@/core/infrastructure/database";
import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";

/** Resultado de cargar la página de un producto de tienda por su slug. */
export type ResultadoPaginaProducto =
  | { tipo: 'ok'; empresa: EmpresaPublic; isPedidos: boolean; item: MenuItemVM; baseUrl: string }
  | { tipo: 'redirigir'; slug: string }
  | { tipo: 'no-encontrado' };

async function cargarProducto(slug: string): Promise<ResultadoPaginaProducto> {
  const fullDomain = await getDomainFromHeaders();
  const { empresa, isPedidos } = await resolverEmpresaPublica(fullDomain);

  // Solo las tiendas tienen página de producto: restaurantes y hosts sin
  // empresa asociada caen aquí (spec PR3: restaurant regression guard).
  if (!empresa || empresa.tipo !== 'tienda') return { tipo: 'no-encontrado' };

  const menuResult = await getCachedMenu(empresa.id);
  // Un fallo transitorio de PostgREST se LANZA (→500), nunca se trata como
  // "producto inexistente": un 404 desindexaría la página ante un error
  // pasajero (misma razón que getCachedMenu — design decisión #5).
  if (menuResult.error) throw new Error(menuResult.error);

  // El menú ya está scopeado a ESTE empresaId (getCachedMenu), así que un
  // slug de otro tenant o un producto inactivo (ya filtrado por
  // GetMenuUseCase) simplemente no aparece aquí.
  const item = findMenuItemBySlug(menuResult.data ?? [], slug);
  const baseUrl = fullDomain ? `https://${fullDomain}` : "https://localhost:3000";
  if (item) return { tipo: 'ok', empresa, isPedidos, item, baseUrl };

  // El histórico SOLO se consulta cuando el slug vivo no resolvió nada
  // (spec PR5: "live slug wins over history") — y resuelve siempre al slug
  // VIVO actual, nunca a otro histórico, así nunca encadena más de un salto
  // (A→B→A resuelve en uno). Scoped a este empresaId: un slug histórico de
  // otro tenant, o de un producto ya inactivo, nunca redirige.
  const historial = await getSlugHistoricoUseCase().resolverSlugActual(empresa.id, slug);
  if (!historial.success) throw new Error(historial.error.message);
  if (historial.data) return { tipo: 'redirigir', slug: historial.data };

  return { tipo: 'no-encontrado' };
}

/**
 * Memoizado por slug dentro de la misma petición: `generateMetadata` y la
 * página piden el mismo producto (React `cache`, no `unstable_cache` — el
 * resultado depende del host resuelto en ESTA petición).
 */
export const cargarPaginaProducto = cache(cargarProducto);
