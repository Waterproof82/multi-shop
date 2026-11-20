// src/app/m/[codigo]/page.tsx
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 9: página pública del perfil de la mascota. Sigue el mismo patrón
// que /kit/[serie] (M2a): llama al cargador, traduce 'no-encontrado' en
// notFound() real, y pinta el componente de servidor dentro del tema del
// tenant (sin SiteHeaderWrapper: evita el carrito y cualquier acción que
// compita con la guía o con «¿Es tu chapa? Actívala»).
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { cargarPerfilPublico } from '@/lib/pet-id/cargar-perfil-publico';
import { idiomaDePeticion } from '@/lib/pet-id/idioma';
import { EmpresaThemeProvider } from '@/components/empresa-theme-provider';
import { PerfilMascota } from '@/components/mascota-publica/perfil';
import { SelectorIdioma } from '@/components/mascota-publica/selector-idioma';

// routes table de design.md: nada de unstable_cache ni otra caché
// compartida por código — el tenant depende del host y el código es de una
// sola mascota.
export const dynamic = 'force-dynamic';

// routes table de design.md: robots noindex/nofollow y sin referrer, SIN
// depender del resultado del cargador — el título nunca lleva el código ni
// el nombre de la mascota.
export function generateMetadata(): Metadata {
  return {
    title: 'Perfil de la mascota',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

interface MascotaPublicaPageProps {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function primerValor(valor: string | string[] | undefined): string | null {
  return Array.isArray(valor) ? (valor[0] ?? null) : (valor ?? null);
}

export default async function MascotaPublicaPage({ params, searchParams }: Readonly<MascotaPublicaPageProps>) {
  const { codigo } = await params;
  const resultado = await cargarPerfilPublico(codigo);

  // notFound() ANTES de cualquier JSX: un loading.tsx en este árbol
  // pintaría su fallback (200) antes de llegar aquí — por eso esta ruta no
  // lo tiene (ver tests/core/mascota-publica-page-guard.test.ts).
  if (resultado.tipo !== 'ok') notFound();

  // DD9: el idioma se resuelve EN EL SERVIDOR (`?lang=` gana si es uno de
  // los 5 soportados; si no, por `accept-language`), nunca con
  // `useLanguage()` — evita el parpadeo y el desajuste con el SSR.
  const resolvedSearchParams = await searchParams;
  const headersList = await headers();
  const idioma = idiomaDePeticion(primerValor(resolvedSearchParams.lang), headersList.get('accept-language'));

  const { empresa, perfil } = resultado;

  return (
    <EmpresaThemeProvider colores={empresa.colores || null}>
      <main id="main-content" className="min-h-screen bg-background">
        <PerfilMascota perfil={perfil} idioma={idioma} />
        <div className="mx-auto max-w-2xl px-4 pb-10">
          <SelectorIdioma idioma={idioma} />
        </div>
      </main>
    </EmpresaThemeProvider>
  );
}
