/**
 * MascotaPublicaPage — guard de notFound() (sdd pet-id-qr-profile, Fase 9).
 *
 * El cargador (`cargarPerfilPublico`) ya prueba, de forma pura, QUÉ entradas
 * colapsan a 'no-encontrado' (ver tests/pet-id/cargar-perfil-publico.test.ts).
 * Este test solo confirma que la PÁGINA traduce ese resultado en un 404
 * real (R-QR.3.2), que no indexa nada y no lleva referrer (routes table de
 * design.md), que es dinámica sin caché y que no tiene loading.tsx (sin él,
 * un Suspense shell pintaría su fallback con 200 antes de que notFound()
 * corra). Calco de `kit-publico-page-guard.test.ts` (M2a).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const cargarPerfilPublico = vi.fn();
const headersGet = vi.fn((_name: string): string | null => null);

vi.mock('@/lib/pet-id/cargar-perfil-publico', () => ({
  cargarPerfilPublico: (...args: unknown[]) => cargarPerfilPublico(...args),
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: headersGet }),
}));

const perfilMascotaMock = vi.fn((..._args: unknown[]) => null);
vi.mock('@/components/mascota-publica/perfil', () => ({
  PerfilMascota: (...args: unknown[]) => perfilMascotaMock(...args),
}));

vi.mock('@/components/mascota-publica/selector-idioma', () => ({
  SelectorIdioma: () => null,
}));

import MascotaPublicaPage, { generateMetadata, dynamic } from '@/app/m/[codigo]/page';
import { renderToStaticMarkup } from 'react-dom/server';

function props(codigo: string, searchParams: Record<string, string | string[] | undefined> = {}) {
  return { params: Promise.resolve({ codigo }), searchParams: Promise.resolve(searchParams) };
}

beforeEach(() => {
  vi.clearAllMocks();
  headersGet.mockReturnValue(null);
});

const PERFIL_OK = {
  tipo: 'ok',
  empresa: { id: 'e1', colores: null },
  perfil: { nombre: 'Luna', especie: 'perro', notas: null, fotoUrl: null, telefono: null },
};

describe('MascotaPublicaPage', () => {
  it('no-encontrado → lanza notFound() (404), nunca una página en blanco silenciosa', async () => {
    cargarPerfilPublico.mockResolvedValue({ tipo: 'no-encontrado' });

    await expect(MascotaPublicaPage(props('M-ABCD-1234-5'))).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it('ok → resuelve sin lanzar', async () => {
    cargarPerfilPublico.mockResolvedValue(PERFIL_OK);

    await expect(MascotaPublicaPage(props('M-ABCD-1234-5'))).resolves.toBeTruthy();
  });

  it('generateMetadata no indexa, no sigue enlaces, y no lleva referrer', () => {
    const metadata = generateMetadata();

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe('no-referrer');
  });

  it('dynamic = force-dynamic (sin caché compartida de datos por código)', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('src/app/m/[codigo] — sin loading.tsx', () => {
  it('no existe loading.tsx: evitaría que notFound() llegue a aplicarse', () => {
    const loadingPath = join(process.cwd(), 'src', 'app', 'm', '[codigo]', 'loading.tsx');
    expect(existsSync(loadingPath)).toBe(false);
  });
});

describe('src/app/m/[codigo] — idioma de quien escanea (DD9, R-QR.6.4)', () => {
  it('?lang=fr gana aunque accept-language diga otra cosa, y se pasa a PerfilMascota', async () => {
    cargarPerfilPublico.mockResolvedValue(PERFIL_OK);
    headersGet.mockImplementation((name: string) => (name === 'accept-language' ? 'es-ES,es;q=0.9' : null));

    renderToStaticMarkup(await MascotaPublicaPage(props('M-ABCD-1234-5', { lang: 'fr' })));

    expect(perfilMascotaMock).toHaveBeenCalledWith(expect.objectContaining({ idioma: 'fr' }), undefined);
  });

  it('sin ?lang=, resuelve por accept-language', async () => {
    cargarPerfilPublico.mockResolvedValue(PERFIL_OK);
    headersGet.mockImplementation((name: string) => (name === 'accept-language' ? 'de-DE,de;q=0.9' : null));

    renderToStaticMarkup(await MascotaPublicaPage(props('M-ABCD-1234-5')));

    expect(perfilMascotaMock).toHaveBeenCalledWith(expect.objectContaining({ idioma: 'de' }), undefined);
  });

  it('sin ?lang= ni accept-language soportado, cae a español por defecto', async () => {
    cargarPerfilPublico.mockResolvedValue(PERFIL_OK);
    headersGet.mockReturnValue(null);

    renderToStaticMarkup(await MascotaPublicaPage(props('M-ABCD-1234-5')));

    expect(perfilMascotaMock).toHaveBeenCalledWith(expect.objectContaining({ idioma: 'es' }), undefined);
  });
});
