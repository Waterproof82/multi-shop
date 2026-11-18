/**
 * cargarGestionAvisos — loader de /kit/avisos/[token] (sdd kit-expiry-m2b,
 * M2b8b). R-M2b.3.1: el GET NO cambia nada (acción 'consultar'), y NO
 * depende de `kits_caducidad_habilitado` ni de la bandera de alta (D-M2b-8
 * — la revocación no puede depender de un flag, mismo criterio que
 * `POST /api/kit-avisos/gestion`, M2b6ba). El límite de peticiones es el
 * mismo `kitPublicoDentroDeLimite` de M2a.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const getDomainFromHeaders = vi.fn();
const resolverEmpresaPublica = vi.fn();
const kitPublicoDentroDeLimite = vi.fn();
const gestionarAvisosUseCase = vi.fn();
const getKitAvisosRepository = vi.fn((..._args: unknown[]) => ({}));
const getAuditLogRepository = vi.fn((..._args: unknown[]) => ({}));
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

vi.mock('@/core/infrastructure/database', () => ({
  getKitAvisosRepository: (...args: unknown[]) => getKitAvisosRepository(...args),
  getAuditLogRepository: (...args: unknown[]) => getAuditLogRepository(...args),
}));

vi.mock('@/core/application/use-cases/kits/gestionarAvisos.use-case', () => ({
  gestionarAvisosUseCase: (...args: unknown[]) => gestionarAvisosUseCase(...args),
}));

import { cargarGestionAvisos } from '@/lib/kit-caducidad/cargar-gestion-avisos';
import type { EmpresaPublic } from '@/core/domain/entities/types';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return { id: 'empresa-1', tipo: 'tienda', ...overrides } as unknown as EmpresaPublic;
}

beforeEach(() => {
  vi.clearAllMocks();
  getDomainFromHeaders.mockResolvedValue('pedidos.kitemergenciacanarias.es');
  headersGet.mockImplementation((name: string) => (name === 'x-real-ip' ? '198.51.100.7' : null));
  kitPublicoDentroDeLimite.mockResolvedValue(true);
});

describe('cargarGestionAvisos — no-encontrado', () => {
  it('sin empresa para este dominio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: null, isPedidos: false });

    expect(await cargarGestionAvisos('token-x')).toEqual({ tipo: 'no-encontrado' });
    expect(kitPublicoDentroDeLimite).not.toHaveBeenCalled();
  });

  it('límite superado — el caso de uso no se llega a llamar', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    kitPublicoDentroDeLimite.mockResolvedValue(false);

    expect(await cargarGestionAvisos('token-x')).toEqual({ tipo: 'no-encontrado' });
    expect(gestionarAvisosUseCase).not.toHaveBeenCalled();
  });

  it('token con forma inválida o desconocido — ok(null)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    gestionarAvisosUseCase.mockResolvedValue({ success: true, data: null });

    expect(await cargarGestionAvisos('token-x')).toEqual({ tipo: 'no-encontrado' });
  });
});

describe('cargarGestionAvisos — errores (nunca se disfrazan de 404)', () => {
  it('lanza si el caso de uso devuelve un error de repositorio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    gestionarAvisosUseCase.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'fallo al leer el token', module: 'kits', method: 'findPorToken' },
    });

    await expect(cargarGestionAvisos('token-x')).rejects.toThrow('fallo al leer el token');
  });
});

describe('cargarGestionAvisos — ok', () => {
  it('llama al caso de uso con accion "consultar" y nunca con kits-habilitado', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    gestionarAvisosUseCase.mockResolvedValue({ success: true, data: { serie: 'KEC-ABCD-1234-5', estado: 'pendiente' } });

    const resultado = await cargarGestionAvisos('token-valido');

    expect(gestionarAvisosUseCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'empresa-1',
      'token-valido',
      'consultar',
      expect.any(String),
    );
    expect(resultado).toEqual({ tipo: 'ok', serie: 'KEC-ABCD-1234-5', estado: 'pendiente' });
  });

  it('usa la IP de las cabeceras para el límite', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    gestionarAvisosUseCase.mockResolvedValue({ success: true, data: null });

    await cargarGestionAvisos('token-x');

    expect(kitPublicoDentroDeLimite).toHaveBeenCalledWith('198.51.100.7');
  });
});
