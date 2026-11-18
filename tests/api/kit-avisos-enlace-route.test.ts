/**
 * `POST /api/kit-avisos/enlace` (sdd kit-expiry-m2b, M2b6b), R-M2b.4:
 * mismas comprobaciones que el alta (bandera → límite IP → JSON/Origin →
 * empresa+módulo → DTO), pero la respuesta final es SIEMPRE `202 { ok:
 * true }` (R-M2b.4.2) — incluso si el email no coincide con nadie — para
 * no permitir enumerar emails registrados desde fuera.
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

const solicitarEnlaceGestionUseCaseMock = vi.fn().mockResolvedValue({ success: true, data: undefined });
vi.mock('@/core/application/use-cases/kits/solicitarEnlaceGestion.use-case', () => ({
  solicitarEnlaceGestionUseCase: (...a: unknown[]) => solicitarEnlaceGestionUseCaseMock(...(a as [])),
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

const { POST } = await import('@/app/api/kit-avisos/enlace/route');

const CUERPO_VALIDO = { serie: 'KEC-ABCD-1234-X', email: 'titular@example.com' };

function peticion(body: unknown = CUERPO_VALIDO): Request {
  return new Request('https://tienda.kitemergenciacanarias.es/api/kit-avisos/enlace', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
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
  solicitarEnlaceGestionUseCaseMock.mockResolvedValue({ success: true, data: undefined });
});

describe('POST /api/kit-avisos/enlace', () => {
  it('con la bandera en false, 404 sin tocar nada más', async () => {
    kitAvisosAltaLiveMock = false;

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(solicitarEnlaceGestionUseCaseMock).not.toHaveBeenCalled();
  });

  it('con el límite por IP superado, 429', async () => {
    kitAvisosDentroDeLimiteMock.mockResolvedValue(false);

    const res = await POST(peticion());

    expect(res.status).toBe(429);
  });

  it('con Content-Type no JSON, 415', async () => {
    esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: false, status: 415 });

    const res = await POST(peticion());

    expect(res.status).toBe(415);
  });

  it('con un Origin de otro host, 403', async () => {
    esPeticionJsonPublicaValidaMock.mockReturnValue({ ok: false, status: 403 });

    const res = await POST(peticion());

    expect(res.status).toBe(403);
  });

  it('sin empresa para el dominio, 404', async () => {
    resolverEmpresaPublicaMock.mockResolvedValue({ empresa: null, isPedidos: false });

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(solicitarEnlaceGestionUseCaseMock).not.toHaveBeenCalled();
  });

  it('con el módulo de kits desactivado, 404', async () => {
    kitsCaducidadHabilitadoParaEmpresaMock.mockResolvedValue(false);

    const res = await POST(peticion());

    expect(res.status).toBe(404);
    expect(solicitarEnlaceGestionUseCaseMock).not.toHaveBeenCalled();
  });

  it('con un DTO no válido (sin email), 400', async () => {
    const res = await POST(peticion({ serie: 'KEC-ABCD-1234-X' }));

    expect(res.status).toBe(400);
    expect(solicitarEnlaceGestionUseCaseMock).not.toHaveBeenCalled();
  });

  it('con un email que coincide, 202 { ok: true } y programa la tarea con after()', async () => {
    const res = await POST(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(202);
    expect(cuerpo).toEqual({ ok: true });
    expect(solicitarEnlaceGestionUseCaseMock).toHaveBeenCalledTimes(1);
    const [, , programar] = solicitarEnlaceGestionUseCaseMock.mock.calls[0];
    await programar(() => Promise.resolve());
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it('con un email que NO coincide con nadie, el mismo 202 { ok: true }', async () => {
    solicitarEnlaceGestionUseCaseMock.mockResolvedValue({ success: true, data: undefined });

    const res = await POST(peticion({ serie: 'KEC-ABCD-1234-X', email: 'otro@example.com' }));
    const cuerpo = await res.json();

    expect(res.status).toBe(202);
    expect(cuerpo).toEqual({ ok: true });
  });

  it('aunque el caso de uso propague un error, sigue respondiendo 202 { ok: true } (R-M2b.4.2)', async () => {
    solicitarEnlaceGestionUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });

    const res = await POST(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(202);
    expect(cuerpo).toEqual({ ok: true });
  });

  it('la respuesta nunca contiene el email enviado', async () => {
    const res = await POST(peticion());
    expect(JSON.stringify(await res.json())).not.toContain('titular@example.com');
  });
});
