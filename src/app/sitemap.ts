import type { MetadataRoute } from "next";
import { getDomainFromHeaders, parseMainDomain } from "@/lib/domain-utils";
import { getSupabaseAnonClient } from "@/core/infrastructure/database/supabase-client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain || 'localhost');
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";

  // Dynamic priority based on empresa
  const supabase = getSupabaseAnonClient();
  const { data: empresa } = await supabase
    .from('empresas')
    .select('actualizado_en')
    .eq('dominio', mainDomain)
    .single();

  const lastModified = empresa?.actualizado_en ? new Date(empresa.actualizado_en) : new Date();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
