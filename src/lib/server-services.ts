import "server-only"; // Ensures this never reaches the client
import { unstable_cache } from 'next/cache';
import { catalogTag } from '@/lib/cache-tags';
import { getSupabaseAnonClient } from "@/core/infrastructure/database/supabase-client";
import { SupabaseProductRepository } from "@/core/infrastructure/database/SupabaseProductRepository";
import { SupabaseCategoryRepository } from "@/core/infrastructure/database/SupabaseCategoryRepository";
import { GetMenuUseCase } from "@/core/application/use-cases/get-menu.use-case";
import { getEmpresaPublicRepository, getComplementoGrupoRepository } from "@/core/infrastructure/database";
import { parseMainDomain } from "@/lib/domain-utils";
import { logger } from "@/core/infrastructure/logging/logger";
import type { EmpresaPublic } from "@/core/domain/entities/types";

// Lazy Use Case instantiation
let _menuUseCase: GetMenuUseCase | undefined;
export function getMenuUseCase(): GetMenuUseCase {
  return _menuUseCase ??= new GetMenuUseCase(
    new SupabaseProductRepository(getSupabaseAnonClient()),
    new SupabaseCategoryRepository(getSupabaseAnonClient()),
    getComplementoGrupoRepository()
  );
}

// DO NOT cache empresa - changes must be visible immediately
export async function getEmpresaByDomain(domain: string): Promise<EmpresaPublic | null> {
  const mainDomain = parseMainDomain(domain);
  const result = await getEmpresaPublicRepository().findByDomainPublic(mainDomain);
  if (!result.success) {
    await logger.logError({
      codigo: result.error.code,
      mensaje: result.error.message,
      modulo: result.error.module,
      metodo: result.error.method ?? 'getEmpresaByDomain',
    });
    return null;
  }
  return result.data;
}

export function isPedidosSubdomain(currentDomain: string, subdomainConfig: string | null): boolean {
  if (!subdomainConfig) return false;
  const config = subdomainConfig.split('.')[0]; // "pedidos.localhost" -> "pedidos"
  const domainParts = currentDomain.split('.');
  return domainParts[0] === config || currentDomain.startsWith(`${subdomainConfig}.`);
}

export function extractMainDomain(fullDomain: string, subdomainConfig: string | null): string {
  if (!subdomainConfig) return fullDomain;
  if (fullDomain.startsWith(`${subdomainConfig}.`)) {
    return fullDomain.substring(subdomainConfig.length + 1);
  }
  return fullDomain;
}

/**
 * Returns the public menu for an empresa, cached in Vercel's data cache.
 * TTL: 1 hour. Busted by revalidateTag(catalogTag(empresaId)) on mutations.
 *
 * `unstable_cache` cachea lo que la funcion RESUELVE, no solo lo que
 * "tiene sentido" cachear — solo se salta el cacheo si la funcion lanza.
 * `GetMenuUseCase.execute` devuelve `{ error }` como valor normal ante un
 * fallo transitorio de PostgREST, asi que sin el `throw` de abajo ese error
 * quedaba congelado como resultado cacheado durante los 3600s completos (o
 * hasta el proximo revalidateTag), afectando a TODOS los dominios de la
 * empresa por igual — la key es `catalogTag(empresaId)`, no por dominio (ver
 * Sentry ca345ef3d53744ecb20dd05c7a578ed1, 2026-09-12: mismo empresa_id,
 * mismo minuto de ventana, dominio distinto al del fallo original 30min
 * antes). El try/catch de aqui devuelve el mismo shape `{ error }` de
 * siempre para no romper el contrato de los callers (`page.tsx`,
 * `api/waiter/catalog`).
 */
export async function getCachedMenu(empresaId: string) {
  try {
    return await unstable_cache(
      async () => {
        const result = await getMenuUseCase().execute(empresaId);
        if (result.error) throw new Error(result.error);
        return result;
      },
      [catalogTag(empresaId)],
      { tags: [catalogTag(empresaId)], revalidate: 3600 }
    )();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
