/**
 * sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3f: caso de uso de
 * purga diaria. Repositorio FALSO (no toca Supabase). DD9: la lógica de qué
 * lotes están inactivos vive en `lotesInactivos` (purga.ts, ya probada en
 * M3b) — aquí se prueba la ORQUESTACIÓN: `ahora − 48h`, qué lotes se purgan
 * y que un fallo en la purga de pendientes no impide la de inactivos.
 */
import { describe, it, expect, vi } from 'vitest';
import { purgarDatosAvisosUseCase } from '@/core/application/use-cases/kits/purgarDatosAvisos.use-case';
import type { IKitAvisosEnvioRepository } from '@/core/domain/repositories/IKitAvisosEnvioRepository';
import type { CaducidadDeLoteMinima } from '@/core/domain/entities/kit-avisos-envio-types';
import type { Result } from '@/core/domain/entities/types';

const AHORA = new Date('2031-01-30T10:00:00.000Z');
const ERROR = { code: 'DB_ERROR', message: 'x', module: 'repository' as const };

type RepoFake = IKitAvisosEnvioRepository & { [K in keyof IKitAvisosEnvioRepository]: ReturnType<typeof vi.fn> };

function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

function crearRepoFake(overrides: Partial<RepoFake> = {}): RepoFake {
  return {
    findEmpresasConAvisos: vi.fn(),
    findKitsConAvisos: vi.fn(),
    findLotesKit: vi.fn(),
    findCaducidades: vi.fn(),
    findEnviados: vi.fn(),
    marcarEnviados: vi.fn(),
    purgarPendientes: vi.fn().mockResolvedValue(ok(0)),
    findLotesConContacto: vi.fn().mockResolvedValue(ok<string[]>([])),
    findUltimasCaducidades: vi.fn().mockResolvedValue(ok<CaducidadDeLoteMinima[]>([])),
    purgarContactoDeLotes: vi.fn().mockResolvedValue(ok(0)),
    ...overrides,
  } as RepoFake;
}

describe('purgarDatosAvisosUseCase — pendientes', () => {
  it('purgarPendientes recibe `ahora − 48h` en ISO', async () => {
    const repo = crearRepoFake();

    await purgarDatosAvisosUseCase(repo, { ahora: AHORA, hoy: '2031-01-30' });

    expect(repo.purgarPendientes).toHaveBeenCalledWith('2031-01-28T10:00:00.000Z');
  });
});

describe('purgarDatosAvisosUseCase — inactivos (DD9)', () => {
  it('usa lotesInactivos(hoy, …) y purga solo los lotes inactivos', async () => {
    const repo = crearRepoFake({
      findLotesConContacto: vi.fn().mockResolvedValue(ok(['lote-vivo', 'lote-muerto'])),
      findUltimasCaducidades: vi.fn().mockResolvedValue(
        ok([
          { loteId: 'lote-vivo', caducaEl: '2031-01-01' },
          { loteId: 'lote-muerto', caducaEl: '2029-01-01' },
        ]),
      ),
    });

    await purgarDatosAvisosUseCase(repo, { ahora: AHORA, hoy: '2031-01-30' });

    expect(repo.purgarContactoDeLotes).toHaveBeenCalledWith(['lote-muerto']);
  });

  it('recuentos: pendientesPurgados, inactivosPurgados y lotesSinFechas', async () => {
    const repo = crearRepoFake({
      purgarPendientes: vi.fn().mockResolvedValue(ok(3)),
      findLotesConContacto: vi.fn().mockResolvedValue(ok(['lote-a', 'lote-b', 'lote-c'])),
      findUltimasCaducidades: vi.fn().mockResolvedValue(ok([{ loteId: 'lote-a', caducaEl: '2029-01-01' }])),
      purgarContactoDeLotes: vi.fn().mockResolvedValue(ok(1)),
    });

    const result = await purgarDatosAvisosUseCase(repo, { ahora: AHORA, hoy: '2031-01-30' });

    expect(result).toEqual({
      success: true,
      data: { pendientesPurgados: 3, inactivosPurgados: 1, lotesSinFechas: 2 },
    });
  });
});

describe('purgarDatosAvisosUseCase — fallos', () => {
  it('un error en la purga de pendientes no impide la de inactivos; el resultado final es error', async () => {
    const repo = crearRepoFake({
      purgarPendientes: vi.fn().mockResolvedValue({ success: false, error: ERROR }),
      findLotesConContacto: vi.fn().mockResolvedValue(ok(['lote-muerto'])),
      findUltimasCaducidades: vi.fn().mockResolvedValue(ok([{ loteId: 'lote-muerto', caducaEl: '2029-01-01' }])),
    });

    const result = await purgarDatosAvisosUseCase(repo, { ahora: AHORA, hoy: '2031-01-30' });

    expect(repo.findLotesConContacto).toHaveBeenCalled();
    expect(repo.purgarContactoDeLotes).toHaveBeenCalledWith(['lote-muerto']);
    expect(result.success).toBe(false);
  });

  it('un error al leer los lotes con contacto detiene la purga de inactivos', async () => {
    const repo = crearRepoFake({
      findLotesConContacto: vi.fn().mockResolvedValue({ success: false, error: ERROR }),
    });

    const result = await purgarDatosAvisosUseCase(repo, { ahora: AHORA, hoy: '2031-01-30' });

    expect(result.success).toBe(false);
    expect(repo.findUltimasCaducidades).not.toHaveBeenCalled();
    expect(repo.purgarContactoDeLotes).not.toHaveBeenCalled();
  });

  it('un error al leer las últimas caducidades detiene la purga de inactivos', async () => {
    const repo = crearRepoFake({
      findLotesConContacto: vi.fn().mockResolvedValue(ok(['lote-a'])),
      findUltimasCaducidades: vi.fn().mockResolvedValue({ success: false, error: ERROR }),
    });

    const result = await purgarDatosAvisosUseCase(repo, { ahora: AHORA, hoy: '2031-01-30' });

    expect(result.success).toBe(false);
    expect(repo.purgarContactoDeLotes).not.toHaveBeenCalled();
  });
});
