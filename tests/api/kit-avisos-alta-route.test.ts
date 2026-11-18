/**
 * `POST /api/kit-avisos/alta` (sdd kit-expiry-m2b, M2b6a), R-M2b.2.1: orden
 * fijo de comprobaciones — bandera → límite por IP → JSON/Origin →
 * empresa+módulo → DTO → caso de uso. SIEMPRE `202 { ok: true }` salvo que
 * el titular legal no tenga email o NIF (R-M2b.2.8, 503 genérico). La
 * respuesta nunca lleva el email (R-M2b.6.1).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let kitAvisosAltaLiveMock = true;
vi.mock('@/lib/kit-caducidad/publico', () => ({
  get KIT_AVISOS_ALTA_LIVE() {
    return kitAvisosAltaLiveMock;
  },
}));

const kitAvisosDentroDeLimiteMock = vi.fn().mockResolvedValue(true);
const ipDeCabecerasMock = vi.fn().mockReturnValue('1.2.3.4');
vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  kitAvisosDentroDeLimite: (...a: unknown[]) => kitAvisosDentroDeLimiteMock(...(a as [])),
  ipDeCabeceras: (...a: unknown[]) => ipDeCabecerasMock(...(a as [])),
}));

const esPeticionJsonPublicaValidaMock = vi.fn().mockReturnValue({ ok: true });
vi.mock('@/lib/peticion-publica', () => ({
  esPeticionJsonPublicaValida: (...a: unknown[]) => esPeticionJsonPublicaValidaMock(...(a as [])),
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

const kitsCaducidadHabilitadoParaEmpresaMock = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/kit-caducidad/kits-habilitado', () => ({
  kitsCaducidadHabilitadoParaEmpresa: (...a: unknown[]) => kitsCaducidadHabilitadoParaEmpresaMock(...(a as [])),
}));

const TITULAR_COMPLETO = {
  nombre: 'Kit Emergencia Canarias SL',
  nif: 'B12345678',
  direccion: null,
  email: 'contacto@kitemergenciacanarias.es',
  telefono: null,
  registroMercantil: null,
};
const getContextMock = vi.fn().mockResolvedValue({ success: true, data: { titular: TITULAR_COMPLETO } });
const getKitAvisosRepositoryMock = vi.fn(() => ({}));
vi.mock('@/core/infrastructure/database', () => ({
  getKitAvisosRepository: (...a: unknown[]) => getKitAvisosRepositoryMock(...(a as [])),
  getEmpresaLegalUseCase: () => ({ getContext: (...a: unknown[]) => getContextMock(...(a as [])) }),
}));

const solicitarAltaAvisosUseCaseMock = vi.fn().mockResolvedValue({ success: true, data: undefined });
vi.mock('@/core/application/use-cases/kits/solicitarAltaAvisos.use-case', () => ({
  solicitarAltaAvisosUseCase: (...a: unknown[]) => solicitarAltaAvisosUseCaseMock(...(a as [])),
}));

const crearEmailKitAvisosBrevoMock = vi.fn().mockReturnValue({ enviar: vi.fn() });
vi.mock('@/lib/kit-caducidad/email-kit-avisos.brevo', () => ({
  crearEmailKitAvisosBrevo: (...a: unknown[]) => crearEmailKitAvisosBrevoMock(...(a as [])),
}));

const afterMock = vi.fn();
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (...a: unknown[]) => afterMock(...(a as [])) };
});

const { POST } = await import('@/app/api/kit-avisos/alta/route');

const CUERPO_VALIDO = {
  serie: 'KEC-ABCD-1234-X',
  email: 'nuevo@example.com',
  aceptaPrivacidad: true,
  avisosEmail: true,
};

function peticion(body: unknown = CUERPO_VALIDO, headersInit: Record<string, string> = { 'content-type': 'application/json' }): Request {
  return new Request('https://tienda.kitemergenciacanarias.es/api/kit-avisos/alta', {
    method: 'POST',
    headers: new Headers(headersInit),
    body: JSON.stringify(body),
  });
}

function peticionConCuerpoRoto(): Request {
  return new Request('https://tienda.kitemergenciacanarias.es/api/kit-avisos/alta', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: '{ esto no es json',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  kitAvisosAltaLiveMock = true;
  kitAvisosDentroDeLimiteMock.mockResolvedValue(true);
  ipDeCabecerasMock.mockReturnValue('1.2.3.4');
  esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: true });
  getDomainFromHeadersMock.mockResolvedValue('tienda.kitemergenciacanarias.es');
  resolverEmpresaPublicaMock.mockResolvedValue({ empresa: EMPRESA, isPedidos: true });
  kitsCaducidadHabilitadoParaEmpresaMock.mockResolvedValue(true);
  getContextMock.mockResolvedValue({ success: true, data: { titular: TITULAR_COMPLETO } });
  solicitarAltaAvisosUseCaseMock.mockResolvedValue({ success: true, data: undefined });
});

describe('POST /api/kit-avisos/alta', () => {
  it('con la bandera en false, 404 sin tocar nada más', async () => {
    kitAvisosAltaLiveMock = false;

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(kitAvisosDentroDeLimiteMock).not.toHaveBeenCalled();
    expect(resolverEmpresaPublicaMock).not.toHaveBeenCalled();
    expect(solicitarAltaAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con el límite por IP superado, 429', async () => {
    kitAvisosDentroDeLimiteMock.mockResolvedValue(false);

    const res = await POST(peticion());

    expect(res.status).toBe(429);
    expect(esPeticionJsonPublicaValidaMock).not.toHaveBeenCalled();
    expect(solicitarAltaAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con Content-Type no JSON, 415', async () => {
    esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: false, status: 415 });

    const res = await POST(peticion());

    expect(res.status).toBe(415);
    expect(resolverEmpresaPublicaMock).not.toHaveBeenCalled();
  });

  it('con un Origin de otro host, 403', async () => {
    esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: false, status: 403 });

    const res = await POST(peticion());

    expect(res.status).toBe(403);
    expect(resolverEmpresaPublicaMock).not.toHaveBeenCalled();
  });

  it('sin empresa para el dominio, 404', async () => {
    resolverEmpresaPublicaMock.mockResolvedValue({ empresa: null, isPedidos: false });

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(kitsCaducidadHabilitadoParaEmpresaMock).not.toHaveBeenCalled();
    expect(solicitarAltaAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con el módulo de kits desactivado, 404', async () => {
    kitsCaducidadHabilitadoParaEmpresaMock.mockResolvedValue(false);

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(solicitarAltaAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con un JSON roto, 400', async () => {
    const res = await POST(peticionConCuerpoRoto());

    expect(res.status).toBe(400);
    expect(solicitarAltaAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con un DTO no válido (sin aceptaPrivacidad), 400', async () => {
    const res = await POST(peticion({ serie: 'KEC-ABCD-1234-X', email: 'nuevo@example.com', avisosEmail: true }));

    expect(res.status).toBe(400);
    expect(solicitarAltaAvisosUseCaseMock).not.toHaveBeenCalled();
  });

  it('con el caso de uso en ok, 202 { ok: true } y programa la tarea con after()', async () => {
    const res = await POST(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(202);
    expect(cuerpo).toEqual({ ok: true });
    expect(solicitarAltaAvisosUseCaseMock).toHaveBeenCalledTimes(1);
    const [, , programar] = solicitarAltaAvisosUseCaseMock.mock.calls[0];
    expect(typeof programar).toBe('function');
    await programar(() => Promise.resolve());
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it('con una serie registrada (el caso de uso sigue devolviendo ok), el mismo 202 { ok: true }', async () => {
    solicitarAltaAvisosUseCaseMock.mockResolvedValue({ success: true, data: undefined });

    const res = await POST(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(202);
    expect(cuerpo).toEqual({ ok: true });
  });

  it('sin remitente completo (el caso de uso devuelve KIT_AVISOS_REMITENTE_INCOMPLETO), 503', async () => {
    solicitarAltaAvisosUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'KIT_AVISOS_REMITENTE_INCOMPLETO', message: 'sin remitente', module: 'use-case' },
    });

    const res = await POST(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(503);
    expect(JSON.stringify(cuerpo)).not.toContain('nuevo@example.com');
  });

  it('la respuesta nunca contiene el email enviado, en ninguna rama', async () => {
    const res1 = await POST(peticion());
    expect(JSON.stringify(await res1.json())).not.toContain('nuevo@example.com');

    solicitarAltaAvisosUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'KIT_AVISOS_REMITENTE_INCOMPLETO', message: 'sin remitente', module: 'use-case' },
    });
    const res2 = await POST(peticion());
    expect(JSON.stringify(await res2.json())).not.toContain('nuevo@example.com');
  });
});
