import { NextResponse } from 'next/server';
import { getEmpresaByDomain } from '@/lib/server-services';
import { getDomainFromHeaders } from '@/lib/domain-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;

  const appName = empresa?.nombre || 'Carta Digital';
  const themeColor = empresa?.colores?.primary || '#000000';
  const backgroundColor = empresa?.colores?.background || '#ffffff';
  const logoUrl = empresa?.logoUrl || '/favicon.ico';

  const manifest = {
    name: appName,
    short_name: appName.substring(0, 30),
    description: empresa?.descripcion?.es || 'Carta digital y pedidos',
    start_url: '/',
    display: 'standalone',
    background_color: backgroundColor,
    theme_color: themeColor,
    orientation: 'portrait-primary',
    icons: [
      {
        src: logoUrl,
        sizes: '192x192',
        type: 'image/webp',
        purpose: 'any',
      },
      {
        src: logoUrl,
        sizes: '512x512',
        type: 'image/webp',
        purpose: 'any',
      },
      {
        src: logoUrl,
        sizes: '512x512',
        type: 'image/webp',
        purpose: 'maskable',
      },
    ],
    categories: ['food', 'shopping'],
    lang: 'es',
  };

  return NextResponse.json(manifest, {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
      'Content-Type': 'application/manifest+json',
    },
  });
}
