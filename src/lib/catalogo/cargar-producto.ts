import "server-only";
import { cache } from "react";
import { getCachedMenu, resolverEmpresaPublica } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { findMenuItemBySlug } from "@/lib/catalogo/productos-publicos";
import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuItemVM } from "@/core/application/dtos/menu-view-model";

/**
 * Resultado de cargar la página de un producto de tienda por su slug.
 *
 * `redirigir` queda reservado para PR5 (histórico de slugs, slug antiguo →
 * current): esta función nunca lo produce todavía — no hay tabla de
 * histórico — pero el tipo ya existe para que `page.tsx` no cambie de forma
 * cuando PR5 lo implemente.
 */
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
  if (!item) return { tipo: 'no-encontrado' };

  const baseUrl = fullDomain ? `https://${fullDomain}` : "https://localhost:3000";
  return { tipo: 'ok', empresa, isPedidos, item, baseUrl };
}

/**
 * Memoizado por slug dentro de la misma petición: `generateMetadata` y la
 * página piden el mismo producto (React `cache`, no `unstable_cache` — el
 * resultado depende del host resuelto en ESTA petición).
 */
export const cargarPaginaProducto = cache(cargarProducto);
