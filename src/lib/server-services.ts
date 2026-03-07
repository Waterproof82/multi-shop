import "server-only"; // Asegura que esto nunca llegue al cliente
import { getSupabaseAnonClient } from "@/core/infrastructure/database/supabase-client";
import { SupabaseProductRepository } from "@/core/infrastructure/database/SupabaseProductRepository";
import { SupabaseCategoryRepository } from "@/core/infrastructure/database/SupabaseCategoryRepository";
import { GetMenuUseCase } from "@/core/application/use-cases/get-menu.use-case";

// Instanciación de Repositorios
const supabase = getSupabaseAnonClient();
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
  logoUrl: string | null;
  urlImage: string | null;
  colores: {
    primary: string;
    primaryForeground: string;
    secondary: string;
    secondaryForeground: string;
    accent: string;
    accentForeground: string;
    background: string;
    foreground: string;
  } | null;
  descripcion: {
    es?: string;
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  } | null;
  titulo: string | null;
  subtitulo: string | null;
  subtitulo2: {
    es?: string;
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  } | null;
  footer1: {
    es?: string;
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  } | null;
  footer2: {
    es?: string;
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  } | null;
  fb: string | null;
  instagram: string | null;
  urlMapa: string | null;
  direccion: string | null;
  telefono: string | null;
  emailNotification: string | null;
}

function mapTranslations(data: any, prefix: string) {
  return data[`${prefix}_es`] || data[`${prefix}_en`] || data[`${prefix}_fr`] || data[`${prefix}_it`] || data[`${prefix}_de`]
    ? {
        es: data[`${prefix}_es`] || null,
        en: data[`${prefix}_en`] || null,
        fr: data[`${prefix}_fr`] || null,
        it: data[`${prefix}_it`] || null,
        de: data[`${prefix}_de`] || null,
      }
    : null;
}

function parseMainDomain(domain: string): string {
  const domainParts = domain.split('.');
  if (domainParts.length >= 2) {
    // Si tiene subdominio (ej: pedidos.localhost o pedidos.dominio.com)
    const potentialSubdomain = domainParts[0];
    if (potentialSubdomain === 'pedidos' || potentialSubdomain.endsWith('-pedidos')) {
      return domainParts.slice(1).join('.');
    }
  }
  return domain;
}

export async function getEmpresaByDomain(domain: string): Promise<EmpresaInfo | null> {
  const mainDomain = parseMainDomain(domain);
  
  // Buscar primero por dominio exacto
  let { data, error } = await supabase
    .from("empresas")
    .select(`
      id, nombre, dominio, mostrar_carrito, moneda, subdomain_pedidos, 
      logo_url, url_image, 
      color_primary, color_primary_foreground, color_secondary, color_secondary_foreground,
      color_accent, color_accent_foreground, color_background, color_foreground,
      descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
      titulo, subtitulo,
      subtitulo2_es, subtitulo2_en, subtitulo2_fr, subtitulo2_it, subtitulo2_de,
      footer1_es, footer1_en, footer1_fr, footer1_it, footer1_de,
      footer2_es, footer2_en, footer2_fr, footer2_it, footer2_de,
      fb, instagram, url_mapa,
      direccion, telefono_whatsapp, email_notification
    `)
    .eq("dominio", mainDomain)
    .maybeSingle();

  // Si no encuentra, buscar por subdominio pedidos
  if (!data) {
    const subdomainPedidos = 'pedidos';
    const isPedidos = domain.startsWith(`${subdomainPedidos}.`) || domain.includes('-pedidos');
    if (isPedidos) {
      // Extraer el dominio principal del subdominio
      const mainDomain = extractMainDomain(domain, subdomainPedidos);
      
      const { data: subdomainData } = await supabase
        .from("empresas")
        .select(`
          id, nombre, dominio, mostrar_carrito, moneda, subdomain_pedidos, 
          logo_url, url_image, 
          color_primary, color_primary_foreground, color_secondary, color_secondary_foreground,
          color_accent, color_accent_foreground, color_background, color_foreground,
          descripcion_es, descripcion_en, descripcion_fr, descripcion_it, descripcion_de,
          titulo, subtitulo,
          subtitulo2_es, subtitulo2_en, subtitulo2_fr, subtitulo2_it, subtitulo2_de,
          footer1_es, footer1_en, footer1_fr, footer1_it, footer1_de,
          footer2_es, footer2_en, footer2_fr, footer2_it, footer2_de,
          fb, instagram, url_mapa,
          direccion, telefono_whatsapp, email_notification
        `)
        .eq("dominio", mainDomain)
        .maybeSingle();
      
      if (subdomainData) data = subdomainData;
    }
  }

  if (error || !data) return null;

  const colores = data.color_primary
    ? {
        primary: data.color_primary,
        primaryForeground: data.color_primary_foreground,
        secondary: data.color_secondary,
        secondaryForeground: data.color_secondary_foreground,
        accent: data.color_accent,
        accentForeground: data.color_accent_foreground,
        background: data.color_background,
        foreground: data.color_foreground,
      }
    : null;

  return {
    id: data.id,
    nombre: data.nombre,
    dominio: data.dominio,
    mostrarCarrito: data.mostrar_carrito ?? false,
    moneda: data.moneda ?? "EUR",
    subdomainPedidos: data.subdomain_pedidos ?? null,
    logoUrl: data.logo_url ?? null,
    urlImage: data.url_image ?? null,
    colores,
    descripcion: mapTranslations(data, 'descripcion'),
    titulo: data.titulo ?? null,
    subtitulo: data.subtitulo ?? null,
    subtitulo2: mapTranslations(data, 'subtitulo2'),
    footer1: mapTranslations(data, 'footer1'),
    footer2: mapTranslations(data, 'footer2'),
    fb: data.fb ?? null,
    instagram: data.instagram ?? null,
    urlMapa: data.url_mapa ?? null,
    direccion: data.direccion ?? null,
    telefono: data.telefono_whatsapp ?? null,
    emailNotification: data.email_notification ?? null,
  };
}

export function isPedidosSubdomain(currentDomain: string, subdomainConfig: string | null): boolean {
  if (!subdomainConfig) return false;
  const config = subdomainConfig.split('.')[0]; // "pedidos.localhost" -> "pedidos"
  const domainParts = currentDomain.split('.');
  // Comprobar si el inicio del dominio coincide con la config
  return domainParts[0] === config || currentDomain.startsWith(`${subdomainConfig}.`);
}

export function extractMainDomain(fullDomain: string, subdomainConfig: string | null): string {
  if (!subdomainConfig) return fullDomain;
  if (fullDomain.startsWith(`${subdomainConfig}.`)) {
    return fullDomain.substring(subdomainConfig.length + 1);
  }
  return fullDomain;
}
