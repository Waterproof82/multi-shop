import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";
import { buildJsonLdGraph, safeJsonStringify } from "@/lib/seo/json-ld";

interface JsonLdProps {
  readonly empresa: EmpresaPublic;
  readonly menuData: MenuCategoryVM[];
  readonly baseUrl: string;
}

// schema.org del tenant (negocio + web + carta). La construccion vive en
// src/lib/seo/json-ld.ts; aqui solo se serializa.
export function JsonLd({ empresa, menuData, baseUrl }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonStringify(buildJsonLdGraph(empresa, menuData, baseUrl)) }}
    />
  );
}
