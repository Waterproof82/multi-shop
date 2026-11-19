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

function caducidad(overrides: Partial<CaducidadDeLote> = {}): CaducidadDeLote {
  return { loteId: 'lote-1', ingredienteId: 'ing-1', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-01', ...overrides };
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

function unBloqueDeKits(repo: RepoFake, kits: KitConContacto[]) {
  repo.findKitsConAvisos.mockResolvedValueOnce(ok(kits)).mockResolvedValueOnce(ok([]));
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

});

describe('enviarAvisosCaducidadUseCase — R4 (treinta y quince días, sin repetir)', () => {
  it('envía el aviso de 30 días el día que faltan 30', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.enviados).toBe(1);
    expect(email.enviar).toHaveBeenCalledTimes(1);
  });

  it('no envía nada el día anterior (faltan 31)', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-29' });

    expect(result.success && result.data.enviados).toBe(0);
    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('envía el aviso de 15 días si el de 30 ya se envió', async () => {
    const enviados: EnviadoAviso[] = [{ serie: SERIE, ingredienteId: 'ing-1', parte: '', umbralDias: 30, enviadoAt: '2031-01-30T08:00:00.000Z' }];
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
      findEnviados: vi.fn().mockResolvedValue(ok(enviados)),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-02-14' });

    expect(result.success && result.data.enviados).toBe(1);
    expect(email.enviar).toHaveBeenCalledTimes(1);
  });

  it('no repite ningún aviso tras enviar el de 30 y el de 15', async () => {
    const enviados: EnviadoAviso[] = [
      { serie: SERIE, ingredienteId: 'ing-1', parte: '', umbralDias: 30, enviadoAt: '2031-01-30T08:00:00.000Z' },
      { serie: SERIE, ingredienteId: 'ing-1', parte: '', umbralDias: 15, enviadoAt: '2031-02-14T08:00:00.000Z' },
    ];
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
      findEnviados: vi.fn().mockResolvedValue(ok(enviados)),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-02-20' });

    expect(result.success && result.data.enviados).toBe(0);
    expect(email.enviar).not.toHaveBeenCalled();
  });

  it('un aviso enviado a un titular anterior (enviadoAt < registradoAt) se vuelve a enviar', async () => {
    const enviados: EnviadoAviso[] = [{ serie: SERIE, ingredienteId: 'ing-1', parte: '', umbralDias: 30, enviadoAt: '2025-01-01T00:00:00.000Z' }];
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
      findEnviados: vi.fn().mockResolvedValue(ok(enviados)),
    });
    unBloqueDeKits(repo, [kit({ registradoAt: '2026-06-01T00:00:00.000Z' })]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.enviados).toBe(1);
    expect(email.enviar).toHaveBeenCalledTimes(1);
  });
});

describe('enviarAvisosCaducidadUseCase — un email por kit', () => {
  it('dos elementos debidos del mismo kit generan un único email', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(
        ok([caducidad(), caducidad({ ingredienteId: 'ing-2', consumible: 'Botiquín', parte: 'gasas' })]),
      ),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.enviados).toBe(1);
    expect(email.enviar).toHaveBeenCalledTimes(1);
  });
});

describe('enviarAvisosCaducidadUseCase — envío, marcado y cabeceras', () => {
  it('un envío correcto marca las claves de `marcar` y pasa cabeceras RFC 8058 + IdempotencyKey', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(repo.marcarEnviados).toHaveBeenCalledTimes(1);
    const [empresaId, filas] = repo.marcarEnviados.mock.calls[0];
    expect(empresaId).toBe(EMPRESA.id);
    expect(filas).toEqual([{ serie: SERIE, ingredienteId: 'ing-1', parte: '', umbralDias: 30 }]);

    const [, , opciones] = email.enviar.mock.calls[0];
    expect(opciones.cabeceras['List-Unsubscribe']).toContain('baja');
    expect(opciones.cabeceras['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(opciones.cabeceras.IdempotencyKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('si `enviar` lanza, no marca, cuenta fallidos y sigue con el siguiente kit', async () => {
    const kitA = kit({ serie: 'KEC-AAAA-BBBB-C', loteId: 'lote-1' });
    const kitB = kit({ serie: 'KEC-DDDD-EEEE-F', loteId: 'lote-2' });
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote(), lote({ loteId: 'lote-2' })])),
      findCaducidades: vi.fn().mockResolvedValue(
        ok([caducidad(), caducidad({ loteId: 'lote-2', ingredienteId: 'ing-2' })]),
      ),
    });
    unBloqueDeKits(repo, [kitA, kitB]);
    const email = { enviar: vi.fn().mockRejectedValueOnce(new Error('brevo caído')).mockResolvedValueOnce(undefined) };
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.fallidos).toBe(1);
    expect(result.success && result.data.enviados).toBe(1);
    expect(repo.marcarEnviados).toHaveBeenCalledTimes(1);
  });

  it('si `marcarEnviados` falla, cuenta sinMarcar y el envío sigue contando como enviado', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
      marcarEnviados: vi.fn().mockResolvedValue({ success: false, error: { code: 'DB_ERROR', message: 'x', module: 'repository' } }),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.sinMarcar).toBe(1);
    expect(result.success && result.data.enviados).toBe(1);
  });
});

// W1 (verify-report.md m3): antes, el remitente de Brevo dependía de un
// estado mutable en la ruta (`crearPuertoEmailPorEmpresa`, M3h), correcto
// solo porque el bucle de empresas es secuencial — invariante no declarado
// en ningún tipo ni test. Ahora cada llamada a `enviar` lleva su propio
// `remitenteNombre` explícito (ver `enviarUno`), así que es trivial probarlo
// con dos empresas sin depender del orden del bucle.
describe('enviarAvisosCaducidadUseCase — remitente por empresa (W1)', () => {
  it('con dos empresas, cada email lleva el remitenteNombre de SU titular', async () => {
    const empresaA: EmpresaConAvisos = { id: 'empresa-a', nombre: 'A', pausada: false };
    const empresaB: EmpresaConAvisos = { id: 'empresa-b', nombre: 'B', pausada: false };
    const titularA = { ...TITULAR_OK, nombre: 'Empresa A SL' };
    const titularB = { ...TITULAR_OK, nombre: 'Empresa B SL' };
    const kitA = kit({ serie: 'KEC-AAAA-AAAA-A', loteId: 'lote-a' });
    const kitB = kit({ serie: 'KEC-BBBB-BBBB-B', loteId: 'lote-b' });

    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([empresaA, empresaB])),
      findKitsConAvisos: vi.fn().mockResolvedValueOnce(ok([kitA])).mockResolvedValueOnce(ok([kitB])),
      findLotesKit: vi
        .fn()
        .mockResolvedValueOnce(ok([lote({ loteId: 'lote-a' })]))
        .mockResolvedValueOnce(ok([lote({ loteId: 'lote-b' })])),
      findCaducidades: vi
        .fn()
        .mockResolvedValueOnce(ok([caducidad({ loteId: 'lote-a' })]))
        .mockResolvedValueOnce(ok([caducidad({ loteId: 'lote-b' })])),
    });
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValueOnce(titularA).mockResolvedValueOnce(titularB);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30' });

    expect(result.success && result.data.enviados).toBe(2);
    expect(email.enviar).toHaveBeenCalledTimes(2);
    const [, , opcionesA] = email.enviar.mock.calls[0];
    const [, , opcionesB] = email.enviar.mock.calls[1];
    expect(opcionesA.remitenteNombre).toBe('Empresa A SL');
    expect(opcionesB.remitenteNombre).toBe('Empresa B SL');
  });
});

describe('enviarAvisosCaducidadUseCase — tope y simular', () => {
  it('con tope 1 y 3 avisos debidos, envía 1 y aplaza 2', async () => {
    const kits = [
      kit({ serie: 'KEC-AAAA-AAAA-A', loteId: 'lote-1' }),
      kit({ serie: 'KEC-BBBB-BBBB-B', loteId: 'lote-2' }),
      kit({ serie: 'KEC-CCCC-CCCC-C', loteId: 'lote-3' }),
    ];
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote(), lote({ loteId: 'lote-2' }), lote({ loteId: 'lote-3' })])),
      findCaducidades: vi.fn().mockResolvedValue(
        ok([caducidad(), caducidad({ loteId: 'lote-2' }), caducidad({ loteId: 'lote-3' })]),
      ),
    });
    unBloqueDeKits(repo, kits);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30', tope: 1 });

    expect(result.success && result.data.enviados).toBe(1);
    expect(result.success && result.data.aplazados).toBe(2);
    expect(email.enviar).toHaveBeenCalledTimes(1);
  });

  it('con `simular`, no llama a enviar ni a marcarEnviados pero calcula los recuentos', async () => {
    const repo = crearRepoFake({
      findEmpresasConAvisos: vi.fn().mockResolvedValue(ok([EMPRESA])),
      findLotesKit: vi.fn().mockResolvedValue(ok([lote()])),
      findCaducidades: vi.fn().mockResolvedValue(ok([caducidad()])),
    });
    unBloqueDeKits(repo, [kit()]);
    const email = crearEmailFake();
    const titularDe = vi.fn().mockResolvedValue(TITULAR_OK);

    const result = await enviarAvisosCaducidadUseCase({ repo, email, titularDe }, { hoy: '2031-01-30', simular: true });

    expect(result.success && result.data.enviados).toBe(1);
    expect(email.enviar).not.toHaveBeenCalled();
    expect(repo.marcarEnviados).not.toHaveBeenCalled();
  });
});
