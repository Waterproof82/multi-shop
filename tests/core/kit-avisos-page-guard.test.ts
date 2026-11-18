/**
 * KitAvisosGestionPage — guard de notFound() (sdd kit-expiry-m2b, M2b8b).
 *
 * El cargador (`cargarGestionAvisos`) ya prueba, de forma pura, QUÉ entradas
 * colapsan a 'no-encontrado' (tests/core/cargar-gestion-avisos.test.ts).
 * Este test confirma que la PÁGINA traduce ese resultado en un 404 real
 * (R-M2b.3.2), que no indexa nada, que no filtra el referrer (R-M2b.3.1),
 * que es dinámica, que no tiene loading.tsx, y que el GET nunca confirma
 * ni borra nada (D-M2b-5: ningún GET cambia datos).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('server-only', () => ({}));

const cargarGestionAvisos = vi.fn();

vi.mock('@/lib/kit-caducidad/cargar-gestion-avisos', () => ({
  cargarGestionAvisos: (...args: unknown[]) => cargarGestionAvisos(...args),
}));

vi.mock('@/components/kit-publico/gestion-avisos-kit', () => ({
  GestionAvisosKit: () => null,
}));

import KitAvisosGestionPage, { generateMetadata, dynamic } from '@/app/kit/avisos/[token]/page';

function props(token: string) {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KitAvisosGestionPage', () => {
  it('no-encontrado → lanza notFound() (404)', async () => {
    cargarGestionAvisos.mockResolvedValue({ tipo: 'no-encontrado' });

    await expect(KitAvisosGestionPage(props('token-x'))).rejects.toMatchObject({
      digest: 'NEXT_HTTP_ERROR_FALLBACK;404',
    });
  });

  it('ok → resuelve sin lanzar', async () => {
    cargarGestionAvisos.mockResolvedValue({ tipo: 'ok', serie: 'KEC-ABCD-1234-5', estado: 'pendiente' });

    await expect(KitAvisosGestionPage(props('token-valido'))).resolves.toBeTruthy();
  });

  it('generateMetadata no indexa, no sigue enlaces y no filtra el referrer', () => {
    const metadata = generateMetadata();

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.referrer).toBe('no-referrer');
  });

  it('dynamic = force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('src/app/kit/avisos/[token] — sin loading.tsx', () => {
  it('no existe loading.tsx', () => {
    const loadingPath = resolve(__dirname, '../../src/app/kit/avisos/[token]/loading.tsx');
    expect(existsSync(loadingPath)).toBe(false);
  });
});

describe('src/app/kit/avisos/[token]/page.tsx — el GET no muta nada (D-M2b-5)', () => {
  it('su código fuente no referencia las acciones confirmar/baja ni los métodos que mutan', () => {
    const contenido = readFileSync(resolve(__dirname, '../../src/app/kit/avisos/[token]/page.tsx'), 'utf8');
    expect(contenido).not.toContain("'confirmar'");
    expect(contenido).not.toContain("'baja'");
    expect(contenido).not.toContain('.confirmar(');
    expect(contenido).not.toContain('.borrar(');
  });
});
