import "server-only"; // Ensures this never reaches the client
import { getSupabaseAnonClient } from "@/core/infrastructure/database/supabase-client";
import { SupabaseProductRepository } from "@/core/infrastructure/database/SupabaseProductRepository";
import { SupabaseCategoryRepository } from "@/core/infrastructure/database/SupabaseCategoryRepository";
import { GetMenuUseCase } from "@/core/application/use-cases/get-menu.use-case";
import { empresaPublicRepository } from "@/core/infrastructure/database";
import { parseMainDomain } from "@/lib/domain-utils";
import type { EmpresaPublic } from "@/core/domain/entities/types";

// Repository instantiation (anon key for public read)
const supabase = getSupabaseAnonClient();
const productRepo = new SupabaseProductRepository(supabase);
const categoryRepo = new SupabaseCategoryRepository(supabase);

// Use Case instantiation
export const getMenuUseCase = new GetMenuUseCase(productRepo, categoryRepo);

// DO NOT cache empresa - changes must be visible immediately
export async function getEmpresaByDomain(domain: string): Promise<EmpresaPublic | null> {
  const mainDomain = parseMainDomain(domain);
  const result = await empresaPublicRepository.findByDomainPublic(mainDomain);
  if (!result.success) {
    console.error('[getEmpresaByDomain] Error:', result.error.message);
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
