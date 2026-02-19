import "server-only"; // Asegura que esto nunca llegue al cliente
import { supabase } from "./supabaseClient";
import { SupabaseProductRepository } from "@/core/infrastructure/database/SupabaseProductRepository";
import { SupabaseCategoryRepository } from "@/core/infrastructure/database/SupabaseCategoryRepository";
import { GetMenuUseCase } from "@/core/application/use-cases/get-menu.use-case";

// Singleton del Cliente Supabase (Server-Side)
// Nota: En Next.js App Router, idealmente usarías createServerClient de @supabase/ssr para cookies,
// pero para lectura pública (menú) la key anónima y url son suficientes por ahora.
// supabase client is imported from supabaseClient singleton

// Instanciación de Repositorios
const productRepo = new SupabaseProductRepository(supabase);
const categoryRepo = new SupabaseCategoryRepository(supabase);

// Instanciación de Casos de Uso
export const getMenuUseCase = new GetMenuUseCase(productRepo, categoryRepo);

export interface EmpresaInfo {
  id: string;
  nombre: string;
  dominio: string;
  mostrarCarrito: boolean;
  moneda: string;
  subdomainPedidos: string | null;
}

export async function getEmpresaByDomain(domain: string): Promise<EmpresaInfo | null> {
  const { data, error } = await supabase
    .from("empresas")
    .select("id, nombre, dominio, mostrar_carrito, moneda, subdomain_pedidos")
    .ilike("dominio", domain)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    dominio: data.dominio,
    mostrarCarrito: data.mostrar_carrito ?? false,
    moneda: data.moneda ?? "EUR",
    subdomainPedidos: data.subdomain_pedidos ?? null,
  };
}

export function isPedidosSubdomain(currentDomain: string, subdomainConfig: string | null): boolean {
  if (!subdomainConfig) return false;
  return currentDomain.startsWith(`${subdomainConfig}.`);
}

export function extractMainDomain(fullDomain: string, subdomainConfig: string | null): string {
  if (!subdomainConfig) return fullDomain;
  if (fullDomain.startsWith(`${subdomainConfig}.`)) {
    return fullDomain.substring(subdomainConfig.length + 1);
  }
  return fullDomain;
}
