import { notFound } from 'next/navigation';
import { getDomainFromHeaders } from '@/lib/domain-utils';
import { resolverEmpresaPublica } from '@/lib/server-services';
import { getEmpresaLegalUseCase } from '@/core/infrastructure/database';
import type { LegalContext } from '@/core/domain/entities/empresa-legal';
import { aplicaPagina, type SlugLegal } from './paginas-legales';

/**
 * Dominio → LegalContext. 404 si el dominio no es de ningún tenant o si la
 * página no aplica a este tenant (p. ej. /devoluciones en un restaurante).
 * Un error de BD se LANZA para que lo recoja error.tsx (no un 404 falso).
 */
export async function cargarContextoLegal(slug: SlugLegal): Promise<LegalContext> {
  const domain = await getDomainFromHeaders();
  const { empresa } = await resolverEmpresaPublica(domain ?? '');
  if (!empresa) notFound();
  if (!aplicaPagina(empresa, slug)) notFound();

  const r = await getEmpresaLegalUseCase().getContext(empresa.id);
  if (!r.success) {
    if (r.error.code === 'NOT_FOUND') notFound();
    throw new Error(`No se pudo cargar el contexto legal: ${r.error.code}`);
  }
  return r.data;
}
