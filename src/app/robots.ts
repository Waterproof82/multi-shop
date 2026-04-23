import type { MetadataRoute } from "next";
import { getDomainFromHeaders } from "@/lib/domain-utils";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const domain = await getDomainFromHeaders();
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";

return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/superadmin/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
