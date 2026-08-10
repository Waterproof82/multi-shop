import { NextRequest, NextResponse } from 'next/server';
import { getCachedMenu, getEmpresaByDomain } from '@/lib/server-services';
import { getDomainFromHeaders } from '@/lib/domain-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Defensa en profundidad multi-tenant: la empresa derivada del dominio
  // debe coincidir con la del token (header inyectado por el proxy).
  const fullDomain = await getDomainFromHeaders();
  const empresa = fullDomain ? await getEmpresaByDomain(fullDomain) : null;
  if (!empresa || empresa.id !== empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const menuResult = await getCachedMenu(empresaId);
  if (!menuResult.data) {
    return NextResponse.json({ error: 'Error al obtener el menú' }, { status: 500 });
  }

  return NextResponse.json({ empresa, menuData: menuResult.data });
}
