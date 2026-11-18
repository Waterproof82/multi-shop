/**
 * sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), R-M2a.1.2/
 * R-M2a.1.3/R-M2a.1.7/R-M2a.2: una serie con forma no válida (control
 * erróneo, vacía, demasiado larga) devuelve `ok(null)` SIN llamar al
 * repositorio (R-M2a.1.7) — el cargador traduce `null` en el mismo 404
 * neutro que una serie desconocida (DD4 de design.md).
 */
import { describe, expect, it, vi } from 'vitest';
import { consultarEstadoKitPublicoUseCase } from '@/core/application/use-cases/kits/consultarEstadoKitPublico.use-case';
import { generarSerie } from '@/lib/kit-caducidad/serie';
import { URL_LISTA_MOCHILA, urlPackRecambio } from '@/lib/kit-caducidad/etiqueta-urls';
import type { IKitCaducidadRepository } from '@/core/domain/repositories/IKitCaducidadRepository';

type KitPublicoRepo = Pick<IKitCaducidadRepository, 'findKitPublico' | 'findCaducidadesEfectivas'>;

function fakeRepo(overrides: Partial<KitPublicoRepo> = {}): KitPublicoRepo {
  return {
    findKitPublico: vi.fn(),
    findCaducidadesEfectivas: vi.fn(),
    ...overrides,
  };
}

const bytes = (...valores: number[]) => () => Uint8Array.from(valores);
const SERIE_VALIDA = generarSerie(bytes(0x12, 0x34, 0x56, 0x78, 0x9a));
const EMPRESA_ID = 'empresa-1';
const HOY = '2031-01-30';

describe('consultarEstadoKitPublicoUseCase — serie inválida', () => {
  it('con el carácter de control erróneo, devuelve null sin llamar al repositorio', async () => {
    const cuerpo = SERIE_VALIDA.slice(4, 8);
    const cambiado = cuerpo[0] === '0' ? '1' : '0';
    const serieControlErroneo = `KEC-${cambiado}${cuerpo.slice(1)}${SERIE_VALIDA.slice(8)}`;
    const findKitPublico = vi.fn();
    const repo = fakeRepo({ findKitPublico });

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, serieControlErroneo, HOY);

    expect(result).toEqual({ success: true, data: null });
    expect(findKitPublico).not.toHaveBeenCalled();
  });

  it("con una cadena vacía, devuelve null sin llamar al repositorio", async () => {
    const findKitPublico = vi.fn();
    const repo = fakeRepo({ findKitPublico });

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, '', HOY);

    expect(result).toEqual({ success: true, data: null });
    expect(findKitPublico).not.toHaveBeenCalled();
  });

  it('con 41 caracteres (demasiado larga para normalizar), devuelve null sin llamar al repositorio', async () => {
    const findKitPublico = vi.fn();
    const repo = fakeRepo({ findKitPublico });

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, 'A'.repeat(41), HOY);

    expect(result).toEqual({ success: true, data: null });
    expect(findKitPublico).not.toHaveBeenCalled();
  });
});

describe('consultarEstadoKitPublicoUseCase — normalización', () => {
  it('con la serie válida en minúsculas y sin guiones, findKitPublico recibe la forma canónica', async () => {
    const entrada = SERIE_VALIDA.toLowerCase().replaceAll('-', '');
    const findKitPublico = vi.fn().mockResolvedValue({ success: true, data: null });
    const repo = fakeRepo({ findKitPublico });

    await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, entrada, HOY);

    expect(findKitPublico).toHaveBeenCalledWith(EMPRESA_ID, SERIE_VALIDA);
  });
});

describe('consultarEstadoKitPublicoUseCase — serie desconocida y errores', () => {
  it('si findKitPublico devuelve null, el resultado es null', async () => {
    const findKitPublico = vi.fn().mockResolvedValue({ success: true, data: null });
    const repo = fakeRepo({ findKitPublico });

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result).toEqual({ success: true, data: null });
  });

  it('si findKitPublico devuelve un error, se propaga tal cual', async () => {
    const error = { code: 'DB_ERROR', message: 'boom', module: 'repository' as const };
    const findKitPublico = vi.fn().mockResolvedValue({ success: false, error });
    const repo = fakeRepo({ findKitPublico });

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result).toEqual({ success: false, error });
  });

  it('si findCaducidadesEfectivas devuelve un error, se propaga tal cual', async () => {
    const error = { code: 'DB_ERROR', message: 'boom', module: 'repository' as const };
    const findKitPublico = vi.fn().mockResolvedValue({
      success: true,
      data: { loteId: 'lote-1', kitNombre: 'Kit Estándar 72h', kitSlug: 'kit-estandar-72h' },
    });
    const findCaducidadesEfectivas = vi.fn().mockResolvedValue({ success: false, error });
    const repo = fakeRepo({ findKitPublico, findCaducidadesEfectivas });

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result).toEqual({ success: false, error });
  });
});

describe('consultarEstadoKitPublicoUseCase — estado y enlaces', () => {
  function repoConCaducidades(caducidades: { ingredienteId: string; consumible: string; parte: string; caducaEl: string }[]) {
    const findKitPublico = vi.fn().mockResolvedValue({
      success: true,
      data: { loteId: 'lote-1', kitNombre: 'Kit Estándar 72h', kitSlug: 'kit-estandar-72h' },
    });
    const findCaducidadesEfectivas = vi.fn().mockResolvedValue({ success: true, data: caducidades });
    return fakeRepo({ findKitPublico, findCaducidadesEfectivas });
  }

  it('botiquín por partes: pastillas al_dia, gasas caduca_pronto, tiritas caducado; general caducado y orden ascendente sin ingredienteId', async () => {
    const repo = repoConCaducidades([
      // 44 días desde el `hoy` del test (2031-01-30): > 30 → al_dia.
      { ingredienteId: 'ing-pastillas', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-15' },
      { ingredienteId: 'ing-botiquin', consumible: 'Botiquín', parte: 'Gasas estériles', caducaEl: '2031-02-10' },
      { ingredienteId: 'ing-botiquin', consumible: 'Botiquín', parte: 'Tiritas', caducaEl: '2030-12-01' },
    ]);

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error('se esperaba data');
    expect(result.data.general).toBe('caducado');
    expect(result.data.elementos.map((e) => e.consumible)).toEqual(['Botiquín', 'Botiquín', 'Pastillas potabilizadoras']);
    expect(result.data.elementos.map((e) => e.estado)).toEqual(['caducado', 'caduca_pronto', 'al_dia']);
    for (const elemento of result.data.elementos) {
      expect(elemento).not.toHaveProperty('ingredienteId');
    }
  });

  it('sin fechas, general es sin_datos', async () => {
    const repo = repoConCaducidades([]);

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error('se esperaba data');
    expect(result.data.general).toBe('sin_datos');
    expect(result.data.elementos).toEqual([]);
  });

  it('los enlaces son la lista fija y el recambio con el slug del kit', async () => {
    const repo = repoConCaducidades([
      { ingredienteId: 'ing-1', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-01' },
    ]);

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result.success).toBe(true);
    if (!result.success || !result.data) throw new Error('se esperaba data');
    expect(result.data.enlaces.lista).toBe(URL_LISTA_MOCHILA);
    expect(result.data.enlaces.recambio).toBe(urlPackRecambio('kit-estandar-72h'));
  });

  it('el resultado no tiene ninguna clave email, telefono ni registrado', async () => {
    const repo = repoConCaducidades([
      { ingredienteId: 'ing-1', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-01' },
    ]);

    const result = await consultarEstadoKitPublicoUseCase(repo, EMPRESA_ID, SERIE_VALIDA, HOY);

    expect(result.success).toBe(true);
    const serializado = JSON.stringify(result);
    expect(serializado).not.toMatch(/email|telefono|registrado/i);
  });
});
