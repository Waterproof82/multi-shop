import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";

interface JsonLdProps {
  readonly empresa: EmpresaPublic;
  readonly menuData: MenuCategoryVM[];
  readonly baseUrl: string;
}

function safeJsonStringify(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function buildRestaurantJsonLd(empresa: EmpresaPublic, menuData: MenuCategoryVM[], baseUrl: string): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${baseUrl}#restaurant`,
    name: empresa.nombre,
    url: baseUrl,
  };

  if (empresa.descripcion?.es) {
    jsonLd.description = empresa.descripcion.es;
  }
  if (empresa.logoUrl) {
    jsonLd.logo = empresa.logoUrl;
    jsonLd.image = empresa.urlImage || empresa.logoUrl;
  }
  if (empresa.telefono) {
    jsonLd.telephone = empresa.telefono;
  }
  if (empresa.direccion) {
    jsonLd.address = {
      "@type": "PostalAddress",
      streetAddress: empresa.direccion,
    };
  }
  if (empresa.fb || empresa.instagram) {
    const sameAs: string[] = [];
    if (empresa.fb) sameAs.push(empresa.fb);
    if (empresa.instagram) sameAs.push(empresa.instagram);
    jsonLd.sameAs = sameAs;
  }

  if (menuData.length > 0) {
    jsonLd.hasMenu = { "@id": `${baseUrl}#menu` };
  }

  return jsonLd;
}

function buildMenuJsonLd(
  empresa: EmpresaPublic,
  menuData: MenuCategoryVM[],
  baseUrl: string
): Record<string, unknown> {
  const menuSections = menuData.map((category) => {
    const items = category.items.map((item) => {
      const menuItem: Record<string, unknown> = {
        "@type": "MenuItem",
        name: item.name,
      };
      if (item.description) {
        menuItem.description = item.description;
      }
      if (item.image) {
        menuItem.image = item.image;
      }
      menuItem.offers = {
        "@type": "Offer",
        price: item.price,
        priceCurrency: empresa.moneda || "EUR",
      };
      return menuItem;
    });

    return {
      "@type": "MenuSection",
      name: category.label,
      hasMenuItem: items,
    };
  });

  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${baseUrl}#menu`,
    name: `Menú de ${empresa.nombre}`,
    url: baseUrl,
    hasMenuSection: menuSections,
  };
}

export function JsonLd({ empresa, menuData, baseUrl }: JsonLdProps) {
  const restaurantJsonLd = buildRestaurantJsonLd(empresa, menuData, baseUrl);
  const menuJsonLd = menuData.length > 0 ? buildMenuJsonLd(empresa, menuData, baseUrl) : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonStringify(restaurantJsonLd) }}
      />
      {menuJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonStringify(menuJsonLd) }}
        />
      )}
    </>
  );
}
