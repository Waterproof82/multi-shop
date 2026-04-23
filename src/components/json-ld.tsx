import type { EmpresaPublic } from "@/core/domain/entities/types";
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model";

interface JsonLdProps {
  readonly empresa: EmpresaPublic;
  readonly menuData: MenuCategoryVM[];
  readonly baseUrl: string;
}

function safeJsonStringify(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replaceAll(String.raw`<`, String.raw`\u003c`)
    .replaceAll(String.raw`>`, String.raw`\u003e`)
    .replaceAll(String.raw`&`, String.raw`\u0026`);
}

// Parse geo coordinates from Google Maps URL
function parseGeoFromUrl(urlMapa: string | null | undefined): { latitude: number; longitude: number } | null {
  if (!urlMapa) return null;
  
  // Try to extract @lat,lng from Google Maps URL
  const geoRegex = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/;
  const match = geoRegex.exec(urlMapa);
  if (match) {
    return {
      latitude: Number.parseFloat(match[1]),
      longitude: Number.parseFloat(match[2]),
    };
  }
  
  // Try to extract from query params ?lat=...&lng=...
  const latRegex = /[?&]lat=(-?\d+\.?\d*)/i;
  const lngRegex = /[?&]lng=(-?\d+\.?\d*)/i;
  const latMatch = latRegex.exec(urlMapa);
  const lngMatch = lngRegex.exec(urlMapa);
  if (latMatch && lngMatch) {
    return {
      latitude: Number.parseFloat(latMatch[1]),
      longitude: Number.parseFloat(lngMatch[1]),
    };
  }
  
  return null;
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
  if (empresa.urlMapa) {
    const geo = parseGeoFromUrl(empresa.urlMapa);
    if (geo) {
      jsonLd.geo = {
        "@type": "GeoCoordinates",
        latitude: geo.latitude,
        longitude: geo.longitude,
      };
    }
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

// Common restaurant FAQ schema - can be extended per empresa
const COMMON_FAQS = [
  {
    question: "¿Hacen pedidos para recoger en tienda?",
    answer: "Sí, puedes pedir online y recoger tu pedido en nuestro local sin esperar.",
  },
  {
    question: "¿Ofrecen opciones vegetarianas o sin gluten?",
    answer: "Consulta nuestro menú, tenemos opciones para diferentes dietas.",
  },
  {
    question: "¿Cómo puedo pagar mi pedido online?",
    answer: "Aceptamos pago online con tarjeta y pago en efectivo al recoger.",
  },
  {
    question: "¿Cuánto tiempo tarda el pedido a domicilio?",
    answer: "El tiempo depende de tu zona. Puedes consultarlo al hacer el pedido.",
  },
];

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
  
  // FAQ schema
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: COMMON_FAQS.map(faq => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonStringify(restaurantJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonStringify(faqJsonLd) }}
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
