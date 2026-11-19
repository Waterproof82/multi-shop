/**
 * `GET /api/cron/kit-avisos` (sdd kit-expiry-m3, M3h), R-M3.1: cron diario
 * que ejecuta el envío de avisos de caducidad (R-M3.2/R-M3.3) y después las
 * purgas (R-M3.5). `verifyCronSecret` protege la ruta — igual que
 * `rgpd-purge` — y `?simular=1` calcula sin enviar ni purgar (R-M3.1.4).
 * R-M3.7.1: la respuesta y los logs solo llevan recuentos, nunca email,
 * teléfono, token ni una serie completa.
 */
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyCronSecretMock = vi.fn().mockReturnValue(true);
vi.mock('@/lib/cron-auth', () => ({
  verifyCronSecret: (...a: unknown[]) => verifyCronSecretMock(...(a as [])),
}));

const hoyEnCanariasMock = vi.fn().mockReturnValue('2031-01-30');
vi.mock('@/lib/kit-caducidad/hoy-canarias', () => ({
  hoyEnCanarias: (...a: unknown[]) => hoyEnCanariasMock(...(a as [])),
}));

const getKitAvisosEnvioRepositoryMock = vi.fn(() => ({}));
const getEmpresaLegalUseCaseMock = vi.fn(() => ({
  getContext: vi.fn().mockResolvedValue({
    success: true,
    data: { titular: { nombre: 'Kit Emergencia Canarias', nif: 'B00000000', direccion: null, email: 'legal@kec.es' } },
  }),
}));
vi.mock('@/core/infrastructure/database', () => ({
  getKitAvisosEnvioRepository: (...a: unknown[]) => getKitAvisosEnvioRepositoryMock(...(a as [])),
  getEmpresaLegalUseCase: (...a: unknown[]) => getEmpresaLegalUseCaseMock(...(a as [])),
}));

const crearEmailKitAvisosBrevoMock = vi.fn(() => ({ enviar: vi.fn() }));
vi.mock('@/lib/kit-caducidad/email-kit-avisos.brevo', () => ({
  crearEmailKitAvisosBrevo: (...a: unknown[]) => crearEmailKitAvisosBrevoMock(...(a as [])),
}));

const logErrorMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/core/infrastructure/logging/logger', () => ({
  logger: { logError: (...a: unknown[]) => logErrorMock(...(a as [])) },
}));

const RESUMEN_AVISOS_OK = {
  empresas: 3, pausadas: 1, sinRemitente: 0, kits: 12, enviados: 2, fallidos: 0, sinMarcar: 0, aplazados: 0,
  empresasConError: 0,
};
const RESUMEN_PURGA_OK = { pendientesPurgados: 4, inactivosPurgados: 1, lotesSinFechas: 0 };

const enviarAvisosCaducidadUseCaseMock = vi.fn().mockResolvedValue({ success: true, data: RESUMEN_AVISOS_OK });
vi.mock('@/core/application/use-cases/kits/enviarAvisosCaducidad.use-case', () => ({
  enviarAvisosCaducidadUseCase: (...a: unknown[]) => enviarAvisosCaducidadUseCaseMock(...(a as [])),
}));

const purgarDatosAvisosUseCaseMock = vi.fn().mockResolvedValue({ success: true, data: RESUMEN_PURGA_OK });
vi.mock('@/core/application/use-cases/kits/purgarDatosAvisos.use-case', () => ({
  purgarDatosAvisosUseCase: (...a: unknown[]) => purgarDatosAvisosUseCaseMock(...(a as [])),
}));

const { GET, maxDuration, dynamic } = await import('@/app/api/cron/kit-avisos/route');

function peticion(query = ''): NextRequest {
  return new NextRequest(`https://kitemergenciacanarias.es/api/cron/kit-avisos${query}`, {
    headers: new Headers({ authorization: 'Bearer secreto' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyCronSecretMock.mockReturnValue(true);
  hoyEnCanariasMock.mockReturnValue('2031-01-30');
  enviarAvisosCaducidadUseCaseMock.mockResolvedValue({ success: true, data: RESUMEN_AVISOS_OK });
  purgarDatosAvisosUseCaseMock.mockResolvedValue({ success: true, data: RESUMEN_PURGA_OK });
});

describe('GET /api/cron/kit-avisos — autenticación', () => {
  it('sin CRON_SECRET válido → 401 sin llamar a ningún caso de uso', async () => {
    verifyCronSecretMock.mockReturnValue(false);

    const res = await GET(peticion());

    expect(res.status).toBe(401);
    expect(enviarAvisosCaducidadUseCaseMock).not.toHaveBeenCalled();
    expect(purgarDatosAvisosUseCaseMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/cron/kit-avisos — orden y fecha', () => {
  it('ejecuta el envío y luego la purga, con hoy = hoyEnCanarias()', async () => {
    const orden: string[] = [];
    enviarAvisosCaducidadUseCaseMock.mockImplementation(async () => {
      orden.push('avisos');
      return { success: true, data: RESUMEN_AVISOS_OK };
    });
    purgarDatosAvisosUseCaseMock.mockImplementation(async () => {
      orden.push('purga');
      return { success: true, data: RESUMEN_PURGA_OK };
    });

    await GET(peticion());

    expect(orden).toEqual(['avisos', 'purga']);
    expect(hoyEnCanariasMock).toHaveBeenCalledTimes(1);
    const opcionesAvisos = enviarAvisosCaducidadUseCaseMock.mock.calls[0][1];
    expect(opcionesAvisos.hoy).toBe('2031-01-30');
  });
});

describe('GET /api/cron/kit-avisos — ?simular=1', () => {
  it('pasa simular: true y no llama a la purga', async () => {
    const res = await GET(peticion('?simular=1'));
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    const opcionesAvisos = enviarAvisosCaducidadUseCaseMock.mock.calls[0][1];
    expect(opcionesAvisos.simular).toBe(true);
    expect(purgarDatosAvisosUseCaseMock).not.toHaveBeenCalled();
    expect(cuerpo).toEqual({ avisos: RESUMEN_AVISOS_OK });
  });
});

describe('GET /api/cron/kit-avisos — respuesta', () => {
  it('los dos ok → 200 con { avisos, purga }', async () => {
    const res = await GET(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(200);
    expect(cuerpo).toEqual({ avisos: RESUMEN_AVISOS_OK, purga: RESUMEN_PURGA_OK });
  });

  it('falla el envío → 500 con los recuentos de la purga', async () => {
    enviarAvisosCaducidadUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'error sin PII', module: 'use-case' },
    });

    const res = await GET(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(500);
    expect(cuerpo).toEqual({ purga: RESUMEN_PURGA_OK });
    expect(logErrorMock).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'DB_ERROR', modulo: 'api' }));
  });

  it('falla la purga → 500 con los recuentos del envío', async () => {
    purgarDatosAvisosUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'error sin PII', module: 'use-case' },
    });

    const res = await GET(peticion());
    const cuerpo = await res.json();

    expect(res.status).toBe(500);
    expect(cuerpo).toEqual({ avisos: RESUMEN_AVISOS_OK });
  });
});

describe('GET /api/cron/kit-avisos — configuración de la ruta', () => {
  it('maxDuration === 300 y dynamic === "force-dynamic"', () => {
    expect(maxDuration).toBe(300);
    expect(dynamic).toBe('force-dynamic');
  });
});

describe('GET /api/cron/kit-avisos — registro (R-M3.7.1)', () => {
  it('la respuesta solo lleva números: sin @ ni una serie completa', async () => {
    const res = await GET(peticion());
    const texto = JSON.stringify(await res.json());

    expect(texto).not.toContain('@');
    expect(texto).not.toMatch(/KEC-[A-Z0-9]{4}-[0-9]{4}-[A-Z]/);
  });

  it('console.info solo lleva números, incluso con fallos', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    enviarAvisosCaducidadUseCaseMock.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'fallo en KEC-ABCD-1234-X para titular@kec.es', module: 'use-case' },
    });

    await GET(peticion());

    const llamadas = infoSpy.mock.calls.map((args) => JSON.stringify(args));
    for (const llamada of llamadas) {
      expect(llamada).not.toContain('@');
      expect(llamada).not.toMatch(/KEC-[A-Z0-9]{4}-[0-9]{4}-[A-Z]/);
    }
    infoSpy.mockRestore();
  });
});

describe('vercel.json', () => {
  it('programa /api/cron/kit-avisos a las 08:00 UTC diarias', () => {
    const contenido = readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8');
    const config = JSON.parse(contenido) as { crons: Array<{ path: string; schedule: string }> };
    const cron = config.crons.find((c) => c.path === '/api/cron/kit-avisos');

    expect(cron).toEqual({ path: '/api/cron/kit-avisos', schedule: '0 8 * * *' });
  });
});
