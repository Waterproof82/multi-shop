import type { MetadataRoute } from "next";
import { getDomainFromHeaders } from "@/lib/domain-utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const domain = await getDomainFromHeaders();
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
