/**
 * sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
 * Fase 10 (DD5/R-QR.4): `solicitarAltaChapaUseCase` decide, según
 * `reservarAlta` y `findContacto`, qué email programar (o ninguno) — nunca
 * distingue la respuesta HTTP (eso lo hace la ruta). DD17: sin remitente,
 * error ANTES de tocar el repositorio. El tope de la Fase 10
 * (`mascotaAltaEmailDentroDeLimite`, clavado por CÓDIGO) se comprueba justo
 * antes de programar cualquier email. Calco de
 * `solicitarAltaAvisos.use-case.test.ts` (M2b).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generarCodigoChapa } from '@/lib/pet-id/codigo';
import { TEXTO_CONSENTIMIENTO_PERFIL_VERSION } from '@/lib/pet-id/consentimiento';
import { esTokenGestion } from '@/lib/kit-caducidad/token-gestion';
import type { IPetPerfilRepository } from '@/core/domain/repositories/IPetPerfilRepository';
import type { EmailKitAvisos, Programar } from '@/core/domain/entities/kit-avisos-types';

vi.mock('@/core/infrastructure/api/rate-limit', () => ({
  mascotaAltaEmailDentroDeLimite: vi.fn().mockResolvedValue(true),
}));

const { solicitarAltaChapaUseCase } = await import('@/core/application/use-cases/mascotas/solicitarAltaChapa.use-case');
const { mascotaAltaEmailDentroDeLimite } = await import('@/core/infrastructure/api/rate-limit');

const CODIGO_VALIDO = generarCodigoChapa(() => Uint8Array.from([0x01, 0x02, 0x03, 0x04, 0x05]));
const EMPRESA_ID = 'empresa-1';

const TITULAR_COMPLETO = {
  nombre: 'Kit Emergencia Canarias SL',
  nif: 'B12345678',
  direccion: null,
  email: 'contacto@kitemergenciacanarias.es',
  telefono: null,
  registroMercantil: null,
};

function fakeRepo(overrides: Partial<IPetPerfilRepository> = {}): IPetPerfilRepository {
  return {
    findPerfilActivo: vi.fn(),
    reservarAlta: vi.fn(),
    findContacto: vi.fn(),
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
    codigo: CODIGO_VALIDO,
    email: 'nuevo@example.com',
    nombre: 'Luna',
    especie: 'perro' as const,
    notas: null,
    idioma: 'es' as const,
    baseUrl: 'https://tienda.kitemergenciacanarias.es',
    titular: TITULAR_COMPLETO,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(mascotaAltaEmailDentroDeLimite).mockReset().mockResolvedValue(true);
});

describe('solicitarAltaChapaUseCase', () => {
  it('con un código inválido, devuelve ok sin llamar al repositorio ni al email', async () => {
    const reservarAlta = vi.fn();
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd({ codigo: 'M-0000-0000-Z' }));

    expect(result).toEqual({ success: true, data: undefined });
    expect(reservarAlta).not.toHaveBeenCalled();
    expect(tareas).toHaveLength(0);
  });

  it('sin remitente (email o NIF del titular ausente), devuelve PET_ALTA_REMITENTE_INCOMPLETO sin llamar al repositorio', async () => {
    const reservarAlta = vi.fn();
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar } = fakeProgramar();

    const result = await solicitarAltaChapaUseCase(
      repo,
      email,
      programar,
      cmd({ titular: { ...TITULAR_COMPLETO, nif: null } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('PET_ALTA_REMITENTE_INCOMPLETO');
    expect(reservarAlta).not.toHaveBeenCalled();
  });

  it('reservarAlta true: programa 1 tarea que envía la confirmación al email nuevo', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: true });
    const findContacto = vi.fn();
    const repo = fakeRepo({ reservarAlta, findContacto });
    const enviar = vi.fn().mockResolvedValue(undefined);
    const email = fakeEmail({ enviar });
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(findContacto).not.toHaveBeenCalled();
    expect(tareas).toHaveLength(1);

    const [empresaIdArg, altaInput] = reservarAlta.mock.calls[0];
    expect(empresaIdArg).toBe(EMPRESA_ID);
    expect(altaInput.codigo).toBe(CODIGO_VALIDO);
    expect(altaInput.email).toBe('nuevo@example.com');
    expect(altaInput.version).toBe(TEXTO_CONSENTIMIENTO_PERFIL_VERSION);
    expect(esTokenGestion(altaInput.token)).toBe(true);

    await tareas[0]();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toBe('nuevo@example.com');
    expect(enviar.mock.calls[0][2]).toEqual({ remitenteEmail: 'contacto@kitemergenciacanarias.es' });
  });

  it('`pendienteCaducaAntesDe` es `ahora - 48h`', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: true });
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar } = fakeProgramar();

    await solicitarAltaChapaUseCase(repo, email, programar, cmd());

    const [, altaInput] = reservarAlta.mock.calls[0];
    const diferenciaMs = new Date(altaInput.ahora).getTime() - new Date(altaInput.pendienteCaducaAntesDe).getTime();
    expect(diferenciaMs).toBe(48 * 60 * 60 * 1000);
  });

  it('reservarAlta false y findContacto activa: programa 1 tarea de "intento" al email del DUEÑO ACTUAL, nunca al nuevo', async () => {
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: false });
    const findContacto = vi.fn().mockResolvedValue({
      success: true,
      data: { estado: 'activa', email: 'duena-actual@example.com', idioma: 'en', nombre: 'Rex', token: 'b'.repeat(43) },
    });
    const repo = fakeRepo({ reservarAlta, findContacto });
    const enviar = vi.fn().mockResolvedValue(undefined);
    const email = fakeEmail({ enviar });
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(1);

    await tareas[0]();
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0]).toBe('duena-actual@example.com');
    expect(enviar.mock.calls[0][0]).not.toBe('nuevo@example.com');
    expect(enviar.mock.calls[0][2]).toEqual({ remitenteEmail: 'contacto@kitemergenciacanarias.es' });
  });

  it.each(['pendiente', null])('reservarAlta false y findContacto %s: no programa ninguna tarea', async (estadoOValor) => {
    const dataContacto =
      estadoOValor === null ? null : { estado: 'pendiente', email: 'x@example.com', idioma: 'es', nombre: 'Rex', token: 'c'.repeat(43) };
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: false });
    const findContacto = vi.fn().mockResolvedValue({ success: true, data: dataContacto });
    const repo = fakeRepo({ reservarAlta, findContacto });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd());

    expect(result).toEqual({ success: true, data: undefined });
    expect(tareas).toHaveLength(0);
  });

  it('con el tope del código superado, no programa ninguna tarea pero sigue siendo ok', async () => {
    vi.mocked(mascotaAltaEmailDentroDeLimite).mockResolvedValue(false);
    const reservarAlta = vi.fn().mockResolvedValue({ success: true, data: true });
    const repo = fakeRepo({ reservarAlta });
    const email = fakeEmail();
    const { programar, tareas } = fakeProgramar();

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd());

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

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd());

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

    const result = await solicitarAltaChapaUseCase(repo, email, programar, cmd());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
    expect(tareas).toHaveLength(0);
  });
});
