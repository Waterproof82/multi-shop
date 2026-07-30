import type { MetadataRoute } from "next";
import { getDomainFromHeaders, parseMainDomain } from "@/lib/domain-utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const domain = await getDomainFromHeaders();
  const mainDomain = parseMainDomain(domain || 'localhost');
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";

  const lastModified = new Date();

  return [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
