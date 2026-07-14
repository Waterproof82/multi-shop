import { headers } from 'next/headers';

// Para cambiar el dominio base del wildcard multi-tenant:
// 1. Añadir BASE_DOMAIN=tunuevodominio.com en las variables de entorno (Vercel + .env.local)
// 2. Actualizar el registro DNS wildcard: *.tunuevodominio.com → cname.vercel-dns.com
// 3. Actualizar el dominio wildcard en Vercel (Settings → Domains)
const BASE_DOMAIN = process.env.BASE_DOMAIN ?? 'digitalizatenerife.es';

export function parseMainDomain(domain: string): string {
  const isPedidos = domain.startsWith('pedidos.') || domain.endsWith('-pedidos');
  return isPedidos
    ? domain.replace(/^pedidos\./, '').replace(/-pedidos$/, '')
    : domain;
}

export function isPedidosDomain(domain: string): boolean {
  return domain !== parseMainDomain(domain);
}

export function isBaseDomain(domain: string): boolean {
  return domain.endsWith(`.${BASE_DOMAIN}`);
}

export function extractSlugFromBaseDomain(domain: string): string | null {
  if (!isBaseDomain(domain)) return null;
  const slug = domain.slice(0, domain.length - BASE_DOMAIN.length - 1);
  return slug.length > 0 && !slug.includes('.') ? slug : null;
}

export async function getDomainFromHeaders(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host');
  if (!host) return '';
  return host.replace(/^www\./, '').toLowerCase().split(':')[0];
}
