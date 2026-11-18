/**
 * cargarEstadoKitPublico — loader de /kit/[serie] (sdd kit-expiry-m2a, M2a4,
 * docs/sdd/kit-expiry-reminders/m2a/design.md DD3).
 *
 * Orden: empresa por dominio → límite → bandera del tenant → caso de uso.
 * El límite cuenta ANTES de la bandera y del caso de uso (R-M2a.1.5) — así
 * una IP que agota el límite nunca llega a leer BD, ni siquiera la bandera.
 * Los CUATRO caminos de R-M2a.1.3 que colapsan en 'no-encontrado' conviven
 * aquí; la página (tests/core/kit-publico-page-guard.test.ts) solo traduce
 * ese resultado en un notFound() real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const getDomainFromHeaders = vi.fn();
const resolverEmpresaPublica = vi.fn();
const kitPublicoDentroDeLimite = vi.fn();
const kitsCaducidadHabilitadoParaEmpresa = vi.fn();
const consultarEstadoKitPublicoUseCase = vi.fn();
const getKitCaducidadRepository = vi.fn((..._args: unknown[]) => ({}));
const hoyEnCanarias = vi.fn((..._args: unknown[]) => '2031-01-30');
const headersGet = vi.fn((name: string) => (name === 'x-real-ip' ? '198.51.100.7' : null));

vi.mock('@/lib/domain-utils', () => ({
  getDomainFromHeaders: (...args: unknown[]) => getDomainFromHeaders(...args),
}));

vi.mock('@/lib/server-services', () => ({
  resolverEmpresaPublica: (...args: unknown[]) => resolverEmpresaPublica(...args),
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: headersGet }),
}));

vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  kitPublicoDentroDeLimite: (...args: unknown[]) => kitPublicoDentroDeLimite(...args),
  ipDeCabeceras: (h: { get: (name: string) => string | null }) => h.get('x-real-ip') ?? 'unknown',
}));

vi.mock('@/lib/kit-caducidad/kits-habilitado', () => ({
  kitsCaducidadHabilitadoParaEmpresa: (...args: unknown[]) => kitsCaducidadHabilitadoParaEmpresa(...args),
}));

vi.mock('@/lib/kit-caducidad/hoy-canarias', () => ({
  hoyEnCanarias: (...args: unknown[]) => hoyEnCanarias(...args),
}));

vi.mock('@/core/infrastructure/database', () => ({
  getKitCaducidadRepository: (...args: unknown[]) => getKitCaducidadRepository(...args),
}));

vi.mock('@/core/application/use-cases/kits/consultarEstadoKitPublico.use-case', () => ({
  consultarEstadoKitPublicoUseCase: (...args: unknown[]) => consultarEstadoKitPublicoUseCase(...args),
}));

import { cargarEstadoKitPublico } from '@/lib/kit-caducidad/cargar-estado-publico';
import type { EmpresaPublic } from '@/core/domain/entities/types';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return { id: 'empresa-1', tipo: 'tienda', ...overrides } as unknown as EmpresaPublic;
}

beforeEach(() => {
  vi.clearAllMocks();
  getDomainFromHeaders.mockResolvedValue('pedidos.kitemergenciacanarias.es');
  hoyEnCanarias.mockReturnValue('2031-01-30');
  headersGet.mockImplementation((name: string) => (name === 'x-real-ip' ? '198.51.100.7' : null));
  kitPublicoDentroDeLimite.mockResolvedValue(true);
  kitsCaducidadHabilitadoParaEmpresa.mockResolvedValue(true);
});

describe('cargarEstadoKitPublico — no-encontrado', () => {
  it('sin empresa para este dominio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: null, isPedidos: false });

    expect(await cargarEstadoKitPublico('KEC-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(kitPublicoDentroDeLimite).not.toHaveBeenCalled();
  });

  it('límite superado — ni la bandera ni el caso de uso se llegan a llamar', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    kitPublicoDentroDeLimite.mockResolvedValue(false);

    expect(await cargarEstadoKitPublico('KEC-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(kitsCaducidadHabilitadoParaEmpresa).not.toHaveBeenCalled();
    expect(consultarEstadoKitPublicoUseCase).not.toHaveBeenCalled();
  });

  it('bandera kits_caducidad_habilitado en false', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    kitsCaducidadHabilitadoParaEmpresa.mockResolvedValue(false);

    expect(await cargarEstadoKitPublico('KEC-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(consultarEstadoKitPublicoUseCase).not.toHaveBeenCalled();
  });

  it('el caso de uso resuelve ok(null) (serie inválida o desconocida)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    consultarEstadoKitPublicoUseCase.mockResolvedValue({ success: true, data: null });

    expect(await cargarEstadoKitPublico('KEC-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
  });
});

describe('cargarEstadoKitPublico — errores (nunca se disfrazan de 404)', () => {
  it('lanza si la bandera del tenant falla', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    kitsCaducidadHabilitadoParaEmpresa.mockRejectedValue(new Error('fallo BD bandera'));

    await expect(cargarEstadoKitPublico('KEC-ABCD-1234-5')).rejects.toThrow('fallo BD bandera');
  });

  it('lanza si el caso de uso devuelve un error de repositorio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    consultarEstadoKitPublicoUseCase.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'fallo al leer caducidades', module: 'kits', method: 'findCaducidadesEfectivas' },
    });

    await expect(cargarEstadoKitPublico('KEC-ABCD-1234-5')).rejects.toThrow('fallo al leer caducidades');
  });
});

describe('cargarEstadoKitPublico — ok', () => {
  it('pasa empresa.id y hoyEnCanarias() al caso de uso, y devuelve {tipo, empresa, estado}', async () => {
    const empresaResuelta = empresa();
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresaResuelta, isPedidos: true });
    const estado = { serie: 'KEC-ABCD-1234-5', kitNombre: 'Kit Estándar 72h', general: 'al_dia', elementos: [], enlaces: { lista: '', recambio: '' } };
    consultarEstadoKitPublicoUseCase.mockResolvedValue({ success: true, data: estado });

    const resultado = await cargarEstadoKitPublico('kec-abcd-1234-5');

    expect(consultarEstadoKitPublicoUseCase).toHaveBeenCalledWith(
      expect.anything(),
      'empresa-1',
      'kec-abcd-1234-5',
      '2031-01-30',
    );
    expect(resultado).toEqual({ tipo: 'ok', empresa: empresaResuelta, estado });
  });

  it('usa la IP de las cabeceras para el límite (ipDeCabeceras vía headers())', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    consultarEstadoKitPublicoUseCase.mockResolvedValue({ success: true, data: null });

    await cargarEstadoKitPublico('KEC-ABCD-1234-5');

    expect(kitPublicoDentroDeLimite).toHaveBeenCalledWith('198.51.100.7');
  });
});
