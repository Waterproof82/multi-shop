/**
 * `POST /api/kit-avisos/gestion` (sdd kit-expiry-m2b, M2b6b), R-M2b.3.5:
 * NO depende de `KIT_AVISOS_ALTA_LIVE` ni de `kits_caducidad_habilitado`
 * (la revocación nunca puede depender de una bandera, D-M2b-8) — solo de
 * `rateLimitPublic`. Un token con forma incorrecta, desconocido en esta
 * empresa o de un alta pendiente caducada dan el MISMO 404 neutro
 * (R-M2b.3.2). `confirmar`/`baja` responden `200 { ok, estado }`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const esPeticionJsonPublicaValidaMock = vi.fn().mockReturnValue({ ok: true });
vi.mock('@/lib/peticion-publica', () => ({
  esPeticionJsonPublicaValida: (...a: unknown[]) => esPeticionJsonPublicaValidaMock(...(a as [])),
}));

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

const { POST } = await import('@/app/api/kit-avisos/gestion/route');

const TOKEN_VALIDO = 'a'.repeat(43);

function peticion(body: unknown): Request {
  return new Request('https://tienda.kitemergenciacanarias.es/api/kit-avisos/gestion', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: true });
  rateLimitPublicMock.mockResolvedValue(null);
  getDomainFromHeadersMock.mockResolvedValue('tienda.kitemergenciacanarias.es');
  resolverEmpresaPublicaMock.mockResolvedValue({ empresa: EMPRESA, isPedidos: true });
  gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'registrada' } });
});

describe('la ruta NO consulta la bandera ni kits_caducidad_habilitado (D-M2b-8)', () => {
  it('su código fuente no importa KIT_AVISOS_ALTA_LIVE ni kitsCaducidadHabilitadoParaEmpresa', () => {
    const contenido = readFileSync(resolve(__dirname, '../../src/app/api/kit-avisos/gestion/route.ts'), 'utf8');
    expect(contenido).not.toContain('KIT_AVISOS_ALTA_LIVE');
    expect(contenido).not.toContain('kitsCaducidadHabilitadoParaEmpresa');
  });
});

describe('POST /api/kit-avisos/gestion', () => {
  it('usa rateLimitPublic y, si está limitado, devuelve su 429', async () => {
    const limitada = new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
    rateLimitPublicMock.mockResolvedValue(limitada);

    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'confirmar' }));

    expect(res.status).toBe(429);
    expect(gestionarAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con Content-Type no JSON, 415', async () => {
    esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: false, status: 415 });

    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'confirmar' }));

    expect(res.status).toBe(415);
  });

  it('sin empresa para el dominio, 404 neutro', async () => {
    resolverEmpresaPublicaMock.mockResolvedValue({ empresa: null, isPedidos: false });

    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'confirmar' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(404);
    expect(cuerpo).toEqual({ error: 'Este enlace ya no es válido' });
  });

  it('con un token de forma incorrecta, 404 neutro sin llamar al caso de uso', async () => {
    const res = await POST(peticion({ token: 'corto', accion: 'confirmar' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(404);
    expect(cuerpo).toEqual({ error: 'Este enlace ya no es válido' });
    expect(gestionarAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con una acción desconocida, 404 neutro sin llamar al caso de uso', async () => {
    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'otra-cosa' }));

    expect(res.status).toBe(404);
    expect(gestionarAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con un token desconocido o un pendiente caducado (el caso de uso devuelve ok(null)), 404 neutro', async () => {
    gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: null });

    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'confirmar' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(404);
    expect(cuerpo).toEqual({ error: 'Este enlace ya no es válido' });
  });

  it('confirmar: 200 con { ok, estado }', async () => {
    gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'registrada' } });

    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'confirmar' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo).toEqual({ ok: true, estado: 'registrada' });
    expect(gestionarAvisosUseCaseMock).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), EMPRESA.id, TOKEN_VALIDO, 'confirmar', expect.any(String),
    );
  });

  it('baja: 200 con { ok, estado }', async () => {
    gestionarAvisosUseCaseMock.mockResolvedValue({ success: true, data: { serie: 'KEC-ABCD-1234-X', estado: 'baja' } });

    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'baja' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo).toEqual({ ok: true, estado: 'baja' });
  });

  it('la respuesta nunca contiene el token', async () => {
    const res = await POST(peticion({ token: TOKEN_VALIDO, accion: 'confirmar' }));
    const cuerpoTexto = JSON.stringify(await res.json());

    expect(cuerpoTexto).not.toContain(TOKEN_VALIDO);
  });
});
