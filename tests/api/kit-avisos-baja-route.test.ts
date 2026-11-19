/**
 * `POST /api/kit-avisos/baja/[token]` (sdd kit-expiry-m3, M3g), DD6/R-M3.6:
 * baja de un clic RFC 8058. El POST lo hace el servidor de correo, no un
 * navegador — nunca manda JSON ni `Origin`, por eso lee `request.formData()`
 * y usa `rateLimitPublic` (no `esPeticionJsonPublicaValida`). R-M3.6.4/
 * D-M2b-8: NUNCA depende de la bandera ni del módulo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rateLimitPublicMock = vi.fn().mockResolvedValue(null);
vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  rateLimitPublic: (...a: unknown[]) => rateLimitPublicMock(...(a as [])),
}));

const getDomainFromHeadersMock = vi.fn().mockResolvedValue('tienda.kitemergenciacanarias.es');
vi.mock('@/lib/domain-utils', () => ({
  getDomainFromHeaders: (...a: unknown[]) => getDomainFromHeadersMock(...(a as [])),
}));

const EMPRESA = { id: 'empresa-1', nombre: 'Kit Emergencia Canarias' };
const resolverEmpresaPublicaMock = vi.fn().mockResolvedValue({ empresa: EMPRESA, isPedidos: true });
vi.mock('@/lib/server-services', () => ({
  resolverEmpresaPublica: (...a: unknown[]) => resolverEmpresaPublicaMock(...(a as [])),
}));

const getKitAvisosRepositoryMock = vi.fn(() => ({}));
const getAuditLogRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getKitAvisosRepository: (...a: unknown[]) => getKitAvisosRepositoryMock(...(a as [])),
  getAuditLogRepository: (...a: unknown[]) => getAuditLogRepositoryMock(...(a as [])),
}));

const gestionarAvisosUseCaseMock = vi.fn();
vi.mock('@/core/application/use-cases/kits/gestionarAvisos.use-case', () => ({
  gestionarAvisosUseCase: (...a: unknown[]) => gestionarAvisosUseCaseMock(...(a as [])),
}));

const { POST } = await import('@/app/api/kit-avisos/baja/[token]/route');

const TOKEN_VALIDO = 'a'.repeat(43);

function peticionUrlencoded(token: string, oneClick = true): Request {
  const body = new URLSearchParams(oneClick ? { 'List-Unsubscribe': 'One-Click' } : {});
  return new Request(`https://tienda.kitemergenciacanarias.es/api/kit-avisos/baja/${token}`, {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    body,
  });
}

function peticionMultipart(token: string, oneClick = true): Request {
  const form = new FormData();
  if (oneClick) form.set('List-Unsubscribe', 'One-Click');
  return new Request(`https://tienda.kitemergenciacanarias.es/api/kit-avisos/baja/${token}`, {
    method: 'POST',
    body: form,
  });
}

function params(token: string): { params: Promise<{ token: string }> } {
  return { params: Promise.resolve({ token }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitPublicMock.mockResolvedValue(null);
  getDomainFromHeadersMock.mockResolvedValue('tienda.kitemergenciacanarias.es');
  resolverEmpresaPublicaMock.mockResolvedValue({ empresa: EMPRESA, isPedidos: true });
  gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'baja' } });
});

describe('la ruta NO depende de la bandera ni del módulo (D-M2b-8)', () => {
  it('su código fuente no importa KIT_AVISOS_ALTA_LIVE ni kitsCaducidadHabilitadoParaEmpresa', () => {
    const contenido = readFileSync(resolve(__dirname, '../../src/app/api/kit-avisos/baja/[token]/route.ts'), 'utf8');
    expect(contenido).not.toContain('KIT_AVISOS_ALTA_LIVE');
    expect(contenido).not.toContain('kitsCaducidadHabilitadoParaEmpresa');
  });

  it('no exporta GET', async () => {
    const modulo: Record<string, unknown> = await import('@/app/api/kit-avisos/baja/[token]/route');
    expect(modulo.GET).toBeUndefined();
  });
});

describe('POST /api/kit-avisos/baja/[token]', () => {
  it('cuerpo urlencoded con List-Unsubscribe=One-Click y token válido → 200', async () => {
    const res = await POST(peticionUrlencoded(TOKEN_VALIDO), params(TOKEN_VALIDO));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo).toEqual({ ok: true });
    expect(gestionarAvisosUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), EMPRESA.id, TOKEN_VALIDO, 'baja', expect.any(String),
    );
  });

  it('cuerpo multipart con List-Unsubscribe=One-Click y token válido → 200', async () => {
    const res = await POST(peticionMultipart(TOKEN_VALIDO), params(TOKEN_VALIDO));

    expect(res.status).toBe(200);
    expect(gestionarAvisosUseCaseMock).toHaveBeenCalled();
  });

  it('sin One-Click, 400 sin llamar al caso de uso', async () => {
    const res = await POST(peticionUrlencoded(TOKEN_VALIDO, false), params(TOKEN_VALIDO));

    expect(res.status).toBe(400);
    expect(gestionarAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('límite superado devuelve la respuesta de rateLimitPublic', async () => {
    const limitada = new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
    rateLimitPublicMock.mockResolvedValue(limitada);

    const res = await POST(peticionUrlencoded(TOKEN_VALIDO), params(TOKEN_VALIDO));

    expect(res.status).toBe(429);
    expect(gestionarAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('sin empresa para el dominio, 404 neutro sin llamar al caso de uso', async () => {
    resolverEmpresaPublicaMock.mockResolvedValue({ empresa: null, isPedidos: false });

    const res = await POST(peticionUrlencoded(TOKEN_VALIDO), params(TOKEN_VALIDO));
    const cuerpo = await res.json();

    expect(res.status).toBe(404);
    expect(cuerpo).toEqual({ error: 'Este enlace ya no es válido' });
    expect(gestionarAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('token mal formado (el caso de uso devuelve ok(null)), 404 neutro', async () => {
    gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: null });

    const res = await POST(peticionUrlencoded('corto'), params('corto'));
    const cuerpo = await res.json();

    expect(res.status).toBe(404);
    expect(cuerpo).toEqual({ error: 'Este enlace ya no es válido' });
  });

  it('token desconocido o ya dado de baja (ok(null)), 404 neutro', async () => {
    gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: null });

    const res = await POST(peticionUrlencoded(TOKEN_VALIDO), params(TOKEN_VALIDO));
    const cuerpo = await res.json();

    expect(res.status).toBe(404);
    expect(cuerpo).toEqual({ error: 'Este enlace ya no es válido' });
  });

  it('un fallo del caso de uso da 500 genérico', async () => {
    gestionarAvisosUseCaseMock.mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x', module: 'use-case' } });

    const res = await POST(peticionUrlencoded(TOKEN_VALIDO), params(TOKEN_VALIDO));

    expect(res.status).toBe(500);
  });

  it('la respuesta nunca contiene el token', async () => {
    const res = await POST(peticionUrlencoded(TOKEN_VALIDO), params(TOKEN_VALIDO));
    const cuerpoTexto = JSON.stringify(await res.json());

    expect(cuerpoTexto).not.toContain(TOKEN_VALIDO);
  });
});
