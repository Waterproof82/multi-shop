/**
 * sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3e: caso de uso de
 * envío del cron diario. Repositorio y email FALSOS (no toca Supabase ni
 * Brevo); `titularDe` falso; `hoy` fijo. DD12: la lógica real vive en
 * `avisos.ts`/`estado.ts`/`email-aviso-caducidad.ts`, ya probados — aquí se
 * prueba la ORQUESTACIÓN (pausa, remitente, bloques, caché por lote, tope,
 * `simular`, fallos).
 *
 * M3e se partió en 2 PR (>400 líneas, tasks.md): M3ea prueba el bucle de
 * empresas y bloques (pausa, remitente, paginación, caché por lote) con
 * `enviarUno` en un stub que solo aplaza; M3eb añade los `describe` del
 * envío real (marcado, cabeceras, fallos, tope, `simular`).
 */
import { describe, it, expect, vi } from 'vitest';
import { enviarAvisosCaducidadUseCase } from '@/core/application/use-cases/kits/enviarAvisosCaducidad.use-case';
import type { IKitAvisosEnvioRepository } from '@/core/domain/repositories/IKitAvisosEnvioRepository';
import type {
  CaducidadDeLote,
  EmpresaConAvisos,
  EnviadoAviso,
  KitConContacto,
  LoteKit,
} from '@/core/domain/entities/kit-avisos-envio-types';
import type { Result } from '@/core/domain/entities/types';

const EMPRESA: EmpresaConAvisos = { id: 'empresa-1', nombre: 'KEC', pausada: false };
const TITULAR_OK = { nombre: 'KEC SL', nif: 'B12345678', direccion: 'Calle Falsa 1', email: 'legal@kec.es' };
const SERIE = 'KEC-AAAA-BBBB-C';
const TOKEN = 'a'.repeat(43);

function kit(overrides: Partial<KitConContacto> = {}): KitConContacto {
  return { serie: SERIE, loteId: 'lote-1', email: 'ana@ejemplo.com', token: TOKEN, registradoAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function lote(overrides: Partial<LoteKit> = {}): LoteKit {
  return { loteId: 'lote-1', kitNombre: 'Kit estándar', kitSlug: 'kit-estandar-72h', ...overrides };
}

type RepoFake = IKitAvisosEnvioRepository & { [K in keyof IKitAvisosEnvioRepository]: ReturnType<typeof vi.fn> };

function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

function crearRepoFake(overrides: Partial<RepoFake> = {}): RepoFake {
  return {
    findEmpresasConAvisos: vi.fn().mockResolvedValue(ok<EmpresaConAvisos[]>([])),
    findKitsConAvisos: vi.fn().mockResolvedValue(ok<KitConContacto[]>([])),
    findLotesKit: vi.fn().mockResolvedValue(ok<LoteKit[]>([])),
    findCaducidades: vi.fn().mockResolvedValue(ok<CaducidadDeLote[]>([])),
    findEnviados: vi.fn().mockResolvedValue(ok<EnviadoAviso[]>([])),
    marcarEnviados: vi.fn().mockResolvedValue(ok<void>(undefined)),
    purgarPendientes: vi.fn(),
    findLotesConContacto: vi.fn(),
    findUltimasCaducidades: vi.fn(),
    purgarContactoDeLotes: vi.fn(),
    ...overrides,
  } as RepoFake;
}

function crearEmailFake() {
  return { enviar: vi.fn().mockResolvedValue(undefined) };
}

describe('enviarAvisosCaducidadUseCase — empresas', () => {
  it('una empresa pausada no envía ni lee kits', async () => {
    const repo = crearRepoFake({ findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([{ ...EMPRESA, pausada: true }])) });
    const email = crearEmailFake();
    const titularDe = vi.fn();

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result).toEqual({
      success: true,
      data: { empresas: 1, pausadas: 1, sinRemitente: 0, kits: 0, enviados: 0, fallidos: 0, sinMarcar: 0, aplazados: 0 },
    });
    expect(titularDe).not.toHaveBeenCalled();
    expect(repo.findKitsConAvisos).not.toHaveBeenCalled();
  });

  it('un titular sin NIF no envía ni lee kits (sinRemitente)', async () => {
    const repo = crearRepoFake({ findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])) });
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue({ ...TITULAR_OK, nif: null });

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.sinRemitente).toBe(1);
    expect(result.success && result.data.enviados).toBe(0);
    expect(repo.findKitsConAvisos).not.toHaveBeenCalled();
  });

  it('un titular nulo (sin contexto legal) también cuenta como sinRemitente', async () => {
    const repo = crearRepoFake({ findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])) });
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(null);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.sinRemitente).toBe(1);
  });

  it('error al leer empresas devuelve success:false', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x', module: 'repository' } }),
    });
    const email = crearEmailFake();
    const titularDe = vi.fn();

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success).toBe(false);
  });
});

describe('enviarAvisosCaducidadUseCase — bloques y caché por lote', () => {
  it('201 kits en 2 bloques (200 + 1) hacen 2 lecturas, y un lote compartido se lee una sola vez', async () => {
    const bloque1 = Array.from({ length: 200 }, (_, i) => kit({ serie: `KEC-${String(i).padStart(4, '0')}-0000-0`, loteId: 'lote-1' }));
    const bloque2 = [kit({ serie: 'KEC-ZZZZ-ZZZZ-Z', loteId: 'lote-1' })];
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findKitsConAvisos: vi.fn().mockResolvedValueOnce(ok(bloque1)).mockResolvedValueOnce(ok(bloque2)).mockResolvedValueOnce(ok([])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([])), // sin caducidades: no hay avisos que enviar, solo se prueba la paginación/caché
    });
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.kits).toBe(201);
    expect(repo.findKitsConAvisos).toHaveBeenCalledTimes(2);
    expect(repo.findLotesKit).toHaveBeenCalledTimes(1);
    expect(repo.findCaducidades).toHaveBeenCalledTimes(1);
  });

  it('sin avisos debidos, el stub de envío aplaza en vez de enviar (lo sustituye M3eb)', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findKitsConAvisos: vi.fn().mockResolvedValueOnce(ok([kit()])).mockResolvedValueOnce(ok([])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([{ loteId: 'lote-1', ingredienteId: 'ing-1', consumible: 'Pastillas', parte: '', caducaEl: '2031-03-01' }])),
    });
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.aplazados).toBe(1);
    expect(result.success && result.data.enviados).toBe(0);
    expect(email.enviar).not.toHaveBeenCalled();
  });
});
