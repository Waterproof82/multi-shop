/**
 * sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), R-M2b.4:
 * `solicitarEnlaceGestionUseCase` solo programa el email de gestión
 * "solicitud" cuando el email recibido coincide (sin distinguir mayúsculas)
 * con el contacto actual de la serie — nunca distingue la respuesta HTTP
 * (siempre 202, R-M2b.4.2), y respeta el mismo tope de 3 emails/24h por
 * serie que el alta (M2b2).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generarSerie } from '@/lib/kit-caducidad/serie';
import type { IKitAvisosRepository } from '@/core/domain/repositories/IKitAvisosRepository';
import type { EmailKitAvisos, Programar } from '@/core/domain/entities/kit-avisos-types';

vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  kitAvisosEmailDentroDeLimite: vi.fn().mockResolvedValue(true),
}));

const { solicitarEnlaceGestionUseCase } = await import(
  '@/core/application/use-cases/kits/solicitarEnlaceGestion.use-case'
);
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
    email: 'TITULAR-ACTUAL@EXAMPLE.COM',
    baseUrl: 'https://tienda.kitemergenciacanarias.es',
    titular: TITULAR_COMPLETO,
    ...overrides,
  };
}

const CONTACTO_REGISTRADO = { estado: 'registrada' as const, email: 'titular-actual@example.com', token: 'd'.repeat(43) };

beforeEach(() => {
  vi.mocked(kitAvisosEmailDentroDeLimite).mockReset().mockResolvedValue(true);
});

describe('solicitarEnlaceGestionUseCase', () => {
  it('con un email que coincide sin distinguir mayúsculas, programa 1 tarea de gestión "solicitud"', async () => {
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: CONTACTO_REGISTRADO });
    const repo = fakeRepo({ findContacto });
    const enviar = vi.fn().mockResolvedValue(undefined);
    const email = fakeEmail({ enviar });
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarEnlaceGestionUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(1);

    await tareas[0]();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toBe('titular-actual@example.com');
    expect(enviar.mock.calls[0][2]).toEqual({ remitenteEmail: 'contacto@kitemergenciacanarias.es' });
  });

  it('con un email que no coincide, no programa ninguna tarea pero sigue siendo ok', async () => {
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: CONTACTO_REGISTRADO });
    const repo = fakeRepo({ findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarEnlaceGestionUseCase(repo, email, programar, cmd({ email: 'otro@example.com' }));

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('sin ningún registro para la serie, no programa ninguna tarea', async () => {
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: null });
    const repo = fakeRepo({ findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarEnlaceGestionUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('con el tope de la serie superado, no programa ninguna tarea aunque el email coincida', async () => {
    vi.mocked(kitAvisosEmailDentroDeLimite).mockResolvedValue(false);
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: CONTACTO_REGISTRADO });
    const repo = fakeRepo({ findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarEnlaceGestionUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('sin remitente (email o NIF del titular ausente), no programa ninguna tarea pero sigue siendo ok', async () => {
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: CONTACTO_REGISTRADO });
    const repo = fakeRepo({ findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarEnlaceGestionUseCase(
      repo,
      email,
      programar,
      cmd({ titular: { ...TITULAR_COMPLETO, nif: null } }),
    );

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('propaga un error de findContacto', async () => {
    const findContacto = vi.fn().mockResolvedValue({
      success: false,
      error: { code: 'DB_ERROR', message: 'boom', module: 'repository' },
    });
    const repo = fakeRepo({ findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarEnlaceGestionUseCase(repo, email, programar, cmd());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
    expect(tareas).toHaveLength(0);
  });
});
