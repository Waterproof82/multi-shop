import { headers } from 'next/headers';

export function parseMainDomain(domain: string): string {
  const isPedidos = domain.startsWith('pedidos.') || domain.endsWith('-pedidos');
  return isPedidos
    ? domain.replace(/^pedidos\./, '').replace(/-pedidos$/, '')
    : domain;
}

export async function getDomainFromHeaders(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get('host');
  if (!host) return '';
  return host.replace(/^www\./, '').toLowerCase().split(':')[0];
}
