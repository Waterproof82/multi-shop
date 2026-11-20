/**
 * cargarPerfilPublico — loader de /m/[codigo] (sdd pet-id-qr-profile,
 * docs/sdd/pet-id-qr-profile/, Fase 9, design.md "Flujo de datos").
 *
 * Orden: empresa por dominio → límite → bandera del tenant → PERFIL_LIVE →
 * caso de uso. R7 de tasks.md: el límite superado da el mismo
 * 'no-encontrado' que cualquier otra rama — nunca un 429 (una RSC no puede
 * devolver uno). Calco de `cargar-estado-kit-publico.test.ts` (M2a).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const getDomainFromHeaders = vi.fn();
const resolverEmpresaPublica = vi.fn();
const mascotaPublicoDentroDeLimite = vi.fn();
const flagModuloHabilitado = vi.fn();
const consultarPerfilPublicoUseCase = vi.fn();
const getPetChapaPerfilRepository = vi.fn((..._args: unknown[]) => ({}));
const headersGet = vi.fn((name: string) => (name === 'x-real-ip' ? '198.51.100.7' : null));
let petPerfilPublicoLiveMock = true;

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
  mascotaPublicoDentroDeLimite: (...args: unknown[]) => mascotaPublicoDentroDeLimite(...args),
  ipDeCabeceras: (h: { get: (name: string) => string | null }) => h.get('x-real-ip') ?? 'unknown',
}));

vi.mock('@/lib/empresa/flag-modulo', () => ({
  flagModuloHabilitado: (...args: unknown[]) => flagModuloHabilitado(...args),
}));

vi.mock('@/lib/pet-id/publico', () => ({
  get PET_PERFIL_PUBLICO_LIVE() {
    return petPerfilPublicoLiveMock;
  },
}));

vi.mock('@/core/infrastructure/database', () => ({
  getPetChapaPerfilRepository: (...args: unknown[]) => getPetChapaPerfilRepository(...args),
}));

vi.mock('@/core/application/use-cases/mascotas/consultarPerfilPublico.use-case', () => ({
  consultarPerfilPublicoUseCase: (...args: unknown[]) => consultarPerfilPublicoUseCase(...args),
}));

import { cargarPerfilPublico } from '@/lib/pet-id/cargar-perfil-publico';
import type { EmpresaPublic } from '@/core/domain/entities/types';

function empresa(overrides: Partial<EmpresaPublic> = {}): EmpresaPublic {
  return { id: 'empresa-1', tipo: 'tienda', ...overrides } as unknown as EmpresaPublic;
}

beforeEach(() => {
  vi.clearAllMocks();
  petPerfilPublicoLiveMock = true;
  getDomainFromHeaders.mockResolvedValue('pedidos.kitemergenciacanarias.es');
  headersGet.mockImplementation((name: string) => (name === 'x-real-ip' ? '198.51.100.7' : null));
  mascotaPublicoDentroDeLimite.mockResolvedValue(true);
  flagModuloHabilitado.mockResolvedValue(true);
});

describe('cargarPerfilPublico — no-encontrado', () => {
  it('sin empresa para este dominio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: null, isPedidos: false });

    expect(await cargarPerfilPublico('M-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(mascotaPublicoDentroDeLimite).not.toHaveBeenCalled();
  });

  it('R7: límite superado — ni la bandera, ni PERFIL_LIVE, ni el caso de uso se llegan a llamar; nunca un 429', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    mascotaPublicoDentroDeLimite.mockResolvedValue(false);

    expect(await cargarPerfilPublico('M-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(flagModuloHabilitado).not.toHaveBeenCalled();
    expect(consultarPerfilPublicoUseCase).not.toHaveBeenCalled();
  });

  it('bandera pet_id_qr_habilitado en false', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    flagModuloHabilitado.mockResolvedValue(false);

    expect(await cargarPerfilPublico('M-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(consultarPerfilPublicoUseCase).not.toHaveBeenCalled();
  });

  it('PET_PERFIL_PUBLICO_LIVE en false — ni el caso de uso se llega a llamar', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    petPerfilPublicoLiveMock = false;

    expect(await cargarPerfilPublico('M-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
    expect(consultarPerfilPublicoUseCase).not.toHaveBeenCalled();
  });

  it('el caso de uso resuelve ok(null) (código inválido, desconocido, libre o pendiente)', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    consultarPerfilPublicoUseCase.mockResolvedValue({ success: true, data: null });

    expect(await cargarPerfilPublico('M-ABCD-1234-5')).toEqual({ tipo: 'no-encontrado' });
  });
});

describe('cargarPerfilPublico — errores (nunca se disfrazan de 404)', () => {
  it('lanza si la bandera del tenant falla', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    flagModuloHabilitado.mockRejectedValue(new Error('fallo BD bandera'));

    await expect(cargarPerfilPublico('M-ABCD-1234-5')).rejects.toThrow('fallo BD bandera');
  });

  it('lanza si el caso de uso devuelve un error de repositorio', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    consultarPerfilPublicoUseCase.mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'fallo al leer el perfil', module: 'repository', method: 'findPerfilActivo' },
    });

    await expect(cargarPerfilPublico('M-ABCD-1234-5')).rejects.toThrow('fallo al leer el perfil');
  });
});

describe('cargarPerfilPublico — ok', () => {
  it('pasa empresa.id y el código al caso de uso, y devuelve {tipo, empresa, perfil}', async () => {
    const empresaResuelta = empresa();
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresaResuelta, isPedidos: true });
    const perfil = { nombre: 'Luna', especie: 'perro', notas: null, fotoUrl: null, telefono: null };
    consultarPerfilPublicoUseCase.mockResolvedValue({ success: true, data: perfil });

    const resultado = await cargarPerfilPublico('m-abcd-1234-5');

    expect(consultarPerfilPublicoUseCase).toHaveBeenCalledWith(expect.anything(), 'empresa-1', 'm-abcd-1234-5');
    expect(resultado).toEqual({ tipo: 'ok', empresa: empresaResuelta, perfil });
  });

  it('usa la IP de las cabeceras para el límite (ipDeCabeceras vía headers())', async () => {
    resolverEmpresaPublica.mockResolvedValue({ empresa: empresa(), isPedidos: false });
    consultarPerfilPublicoUseCase.mockResolvedValue({ success: true, data: null });

    await cargarPerfilPublico('M-ABCD-1234-5');

    expect(mascotaPublicoDentroDeLimite).toHaveBeenCalledWith('198.51.100.7');
  });
});
