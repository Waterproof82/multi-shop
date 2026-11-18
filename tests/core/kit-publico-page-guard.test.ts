/**
 * KitPublicoPage — guard de notFound() (sdd kit-expiry-m2a, M2a4).
 *
 * El cargador (`cargarEstadoKitPublico`) ya prueba, de forma pura, QUÉ
 * entradas colapsan a 'no-encontrado' (ver tests/core/cargar-estado-kit-publico.test.ts).
 * Este test solo confirma que la PÁGINA traduce ese resultado en un 404
 * real (R-M2a.1.3), que no indexa nada (R-M2a.3.1), que es dinámica sin
 * caché (R-M2a.3.2) y que no tiene loading.tsx (R-M2a.3.3 — sin él, un
 * Suspense shell pintaría 200 antes de que notFound() corra).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));

const cargarEstadoKitPublico = vi.fn();

vi.mock('@/lib/kit-caducidad/cargar-estado-publico', () => ({
  cargarEstadoKitPublico: (...args: unknown[]) => cargarEstadoKitPublico(...args),
}));

vi.mock('@/components/kit-publico/estado-kit-publico', () => ({
  EstadoKitPublico: () => null,
}));

// kit-expiry-m2b (M2b8a), R-M2b.1.1/R-M2b.4.1: los dos formularios de avisos
// van detrás de KIT_AVISOS_ALTA_LIVE (DD10) — la misma bandera que las rutas
// de alta y enlace (M2b6a/M2b6b).
let kitAvisosAltaLiveMock = false;
vi.mock('@/lib/kit-caducidad/publico', () => ({
  get KIT_AVISOS_ALTA_LIVE() {
    return kitAvisosAltaLiveMock;
  },
}));
vi.mock('@/components/kit-publico/formulario-avisos-kit', () => ({
  FormularioAvisosKit: () => 'formulario-avisos-kit-stub',
}));
vi.mock('@/components/kit-publico/enlace-gestion-kit', () => ({
  EnlaceGestionKit: () => 'enlace-gestion-kit-stub',
}));

import KitPublicoPage, { generateMetadata, dynamic } from '@/app/kit/[serie]/page';
import { renderToStaticMarkup } from 'react-dom/server';

function props(serie: string) {
  return { params: Promise.resolve({ serie }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  kitAvisosAltaLiveMock = false;
});

const OK = {
  tipo: 'ok',
  empresa: { id: 'e1', colores: null },
  estado: {
    serie: 'KEC-ABCD-1234-5',
    kitNombre: 'Kit Estándar 72h',
    general: 'al_dia',
    elementos: [],
    enlaces: { lista: '', recambio: '' },
  },
};

describe('KitPublicoPage', () => {
  it('no-encontrado → lanza notFound() (404), nunca una página en blanco silenciosa', async () => {
    cargarEstadoKitPublico.mockResolvedValue({ tipo: 'no-encontrado' });

    await expect(KitPublicoPage(props('KEC-ABCD-1234-5'))).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it('ok → resuelve sin lanzar', async () => {
    cargarEstadoKitPublico.mockResolvedValue({
      tipo: 'ok',
      empresa: { id: 'e1', colores: null },
      estado: {
        serie: 'KEC-ABCD-1234-5',
        kitNombre: 'Kit Estándar 72h',
        general: 'al_dia',
        elementos: [],
        enlaces: { lista: '', recambio: '' },
      },
    });

    await expect(KitPublicoPage(props('KEC-ABCD-1234-5'))).resolves.toBeTruthy();
  });

  it('generateMetadata no indexa, no sigue enlaces, y el título no lleva la serie', async () => {
    cargarEstadoKitPublico.mockResolvedValue({ tipo: 'ok' });

    const metadata = await generateMetadata();

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(metadata.title)).not.toContain('KEC-');
  });

  it('dynamic = force-dynamic (R-M2a.3.2: sin caché compartida de datos por serie)', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('src/app/kit/[serie] — sin loading.tsx', () => {
  it('no existe loading.tsx: evitaría que notFound() llegue a aplicarse', () => {
    const loadingPath = join(process.cwd(), 'src', 'app', 'kit', '[serie]', 'loading.tsx');
    expect(existsSync(loadingPath)).toBe(false);
  });
});

describe('src/app/kit/[serie] — formularios de avisos detrás de KIT_AVISOS_ALTA_LIVE (M2b8a)', () => {
  it('con la bandera en false, no pinta ninguno de los dos formularios', async () => {
    kitAvisosAltaLiveMock = false;
    cargarEstadoKitPublico.mockResolvedValue(OK);

    const elemento = await KitPublicoPage(props('KEC-ABCD-1234-5'));
    const html = renderToStaticMarkup(elemento);

    expect(html).not.toContain('formulario-avisos-kit-stub');
    expect(html).not.toContain('enlace-gestion-kit-stub');
  });

  it('con la bandera en true, pinta los dos formularios', async () => {
    kitAvisosAltaLiveMock = true;
    cargarEstadoKitPublico.mockResolvedValue(OK);

    const elemento = await KitPublicoPage(props('KEC-ABCD-1234-5'));
    const html = renderToStaticMarkup(elemento);

    expect(html).toContain('formulario-avisos-kit-stub');
    expect(html).toContain('enlace-gestion-kit-stub');
  });
});
