/**
 * sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), R-M2b.2:
 * `solicitarAltaAvisosUseCase` decide, según `reservarAlta` y
 * `findContacto`, qué email programar (o ninguno) — nunca distingue la
 * respuesta HTTP (eso lo hace la ruta, M2b6a; aquí solo se comprueban las
 * tareas programadas). DD8/R-M2b.2.8: sin remitente, error ANTES de tocar
 * el repositorio. R-M2b.2.7: tope de 3 emails/24h por serie (fail-open,
 * M2b2) se comprueba justo antes de programar cualquier email.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generarSerie } from '@/lib/kit-caducidad/serie';
import { TEXTO_CONSENTIMIENTO_VERSION } from '@/lib/kit-caducidad/consentimiento';
import { esTokenGestion } from '@/lib/kit-caducidad/token-gestion';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { EmailKitAvisos, Programar } from '@/core/domain/entities/kit-avisos-types';

vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  kitAvisosEmailDentroDeLimite: vi.fn().mockResolvedValue(true),
}));

const { solicitarAltaAvisosUseCase } = await import('@/core/application/use-cases/kits/solicitarAltaAvisos.use-case');
const { kitAvisosEmailDentroDeLimite } = await import('@/core/infrastructure/api/rate-limit');

const bytes = (...valores: number[]) => () => Uint8Array.from(valores);
const SERIE_VALIDA = generarSerie(bytes(0x12, 0x34, 0x56, 0x78, 0x9a));
const EMPRESA_ID = 'empresa-1';

const TITULAR_COMPLETO = {
  nombre: 'Kit Emergencia Canarias SL',
  nif: 'B12345678',
  direccion: null,
  email: 'contacto@kitemergenciacanarias.es',
  telefono: null,
  registroMercantil: null,
};

function fakeRepo(overrides: Partial<IKitAvisosRepository> = {}): IKitAvisosRepository {
  return {
    reservarAlta: vi.fn(),
    findContacto: vi.fn(),
    findPorToken: vi.fn(),
    confirmar: vi.fn(),
    borrar: vi.fn(),
    ...overrides,
  };
}

function fakeEmail(overrides: Partial<EmailKitAvisos> = {}): EmailKitAvisos {
  return { enviar: vi.fn().mockResolvedValue(undefined), ...overrides };
}

function fakeProgramar() {
  const tareas: Array<() => Promise<void>> = [];
  const programar: Programar = (tarea) => {
    tareas.push(tarea);
  };
  return { programar, tareas };
}

function cmd(overrides: Record<string, unknown> = {}) {
  return {
    empresaId: EMPRESA_ID,
    serie: SERIE_VALIDA,
    email: 'nuevo@example.com',
    telefono: null,
    whatsapp: false,
    baseUrl: 'https://tienda.kitemergenciacanarias.es',
    titular: TITULAR_COMPLETO,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(kitAvisosEmailDentroDeLimite).mockReset().mockResolvedValue(true);
});

describe('solicitarAltaAvisosUseCase', () => {
  it('con una serie no válida, devuelve ok sin llamar al repositorio ni al email', async () => {
    const reservarAlta = vi.fn();
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd({ serie: 'KEC-0000-0000-Z' }));

    expect(result).toEqual({ success: true, data: undefined });
    expect(reservarAlta).not.toHaveBeenCalled();
    expect(tareas).toHaveLength(0);
  });

  it('sin remitente (email o NIF del titular ausente), devuelve KIT_AVISOS_REMITENTE_INCOMPLETO sin llamar al repositorio', async () => {
    const reservarAlta = vi.fn();
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(
      repo,
      email,
      programar,
      cmd({ titular: { ...TITULAR_COMPLETO, nif: null } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('KIT_AVISOS_REMITENTE_INCOMPLETO');
    expect(reservarAlta).not.toHaveBeenCalled();
  });

  it('reservarAlta true: programa 1 tarea que envía la confirmación al email nuevo', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: true });
    const findContacto = vi.fn();
    const repo = fakeRepo({ reservarAlta, findContacto });
    const enviar = vi.fn().mockResolvedValue(undefined);
    const email = fakeEmail({ enviar });
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(findContacto).not.toHaveBeenCalled();
    expect(tareas).toHaveLength(1);

    const [input] = reservarAlta.mock.calls[0];
    expect(input).toBe(EMPRESA_ID);
    const [, altaInput] = reservarAlta.mock.calls[0];
    expect(altaInput.serie).toBe(SERIE_VALIDA);
    expect(altaInput.email).toBe('nuevo@example.com');
    expect(altaInput.version).toBe(TEXTO_CONSENTIMIENTO_VERSION);
    expect(esTokenGestion(altaInput.token)).toBe(true);
    expect(altaInput.registrado_at ?? null).toBeNull();

    await tareas[0]();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toBe('nuevo@example.com');
  });

  it('`pendienteCaducaAntesDe` es `ahora - 48h`', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: true });
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar } = fakeProgramar();

    await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    const [, altaInput] = reservarAlta.mock.calls[0];
    const diferenciaMs = new Date(altaInput.ahora).getTime() - new Date(altaInput.pendienteCaducaAntesDe).getTime();
    expect(diferenciaMs).toBe(48 * 60 * 60 * 1000);
  });

  it('reservarAlta false y findContacto registrada: programa 1 tarea de gestión "intento" al email del titular ACTUAL, nunca al nuevo', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: false });
    const findContacto = vi.fn().mockResolvedValue({
      success: true,
      data: { estado: 'registrada', email: 'titular-actual@example.com', token: 'b'.repeat(43) },
    });
    const repo = fakeRepo({ reservarAlta, findContacto });
    const enviar = vi.fn().mockResolvedValue(undefined);
    const email = fakeEmail({ enviar });
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(1);

    await tareas[0]();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toBe('titular-actual@example.com');
    expect(enviar.mock.calls[0][0]).not.toBe('nuevo@example.com');
  });

  it.each(['pendiente', null])('reservarAlta false y findContacto %s: no programa ninguna tarea', async (estadoOValor) => {
    const dataContacto = estadoOValor === null ? null : { estado: 'pendiente', email: 'x@example.com', token: 'c'.repeat(43) };
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: false });
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: dataContacto });
    const repo = fakeRepo({ reservarAlta, findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('con el tope de la serie superado, no programa ninguna tarea pero sigue siendo ok', async () => {
    vi.mocked(kitAvisosEmailDentroDeLimite).mockResolvedValue(false);
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: true });
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('propaga un error de reservarAlta', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
    expect(tareas).toHaveLength(0);
  });

  it('propaga un error de findContacto', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: false });
    const findContacto = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });
    const repo = fakeRepo({ reservarAlta, findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaAvisosUseCase(repo, email, programar, cmd());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
    expect(tareas).toHaveLength(0);
  });
});
