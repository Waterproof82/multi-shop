/**
 * sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3d2a/M3d2b/M3d2c/
 * M3d3/M3d4: repositorio del cron diario de avisos y purgas. Cliente
 * simulado local (mismo patrón que `supabase-kit-avisos.repository.test.ts`,
 * M2b3), ampliado con `in`/`not`/`order`/`range`/`upsert` para capturar la
 * cadena real de PostgREST, y con una COLA de respuestas por fila de
 * `.from()` (M3d3/M3d4 recorren `.range()` hasta agotar: cada vuelta es un
 * `.from()` nuevo que consume la siguiente respuesta de la cola).
 *
 * M3d2 se partió en 3 PR (un método por PR, >400 líneas): M3d2a
 * (`findEmpresasConAvisos`), M3d2b (`findKitsConAvisos`), M3d2c
 * (`findLotesKit`) — cada una añade su propio bloque `describe` aquí.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface NotFake {
  col: string;
  op: string;
  val: unknown;
}

interface OrderFake {
  col: string;
  opts?: { ascending?: boolean };
}

interface LlamadaFake {
  tabla: string;
  metodo: 'select' | 'update' | 'upsert' | null;
  payload?: unknown;
  upsertOptions?: { onConflict?: string };
  select?: string;
  filtros: Record<string, unknown>;
  ins: Record<string, unknown[]>;
  nots: NotFake[];
  orders: OrderFake[];
  range?: { desde: number; hasta: number };
  or?: string;
  is: Record<string, unknown>;
  gt: Record<string, unknown>;
}

interface RespuestaFake {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/**
 * `respuestas` es la cola de resultados que devuelve cada `.from()` nuevo,
 * EN ORDEN. Si solo hay una, se repite siempre. Si hay varias, se consumen
 * una a una — así una llamada con `.range()` en bucle (M3d3/M3d4) puede
 * simular "1000 filas, luego 3" con dos elementos.
 */
function crearClienteFake(respuestas: RespuestaFake | readonly RespuestaFake[]) {
  const cola = Array.isArray(respuestas) ? [...respuestas] : [respuestas];
  const llamadas: LlamadaFake[] = [];

  function siguienteRespuesta(): RespuestaFake {
    return cola.length > 1 ? (cola.shift() as RespuestaFake) : cola[0];
  }

  function from(tabla: string) {
    const registro: LlamadaFake = { tabla, metodo: null, filtros: {}, ins: {}, nots: [], orders: [], is: {}, gt: {} };
    llamadas.push(registro);

    const builder = {
      select(cols?: string) {
        registro.metodo ??= 'select';
        registro.select = cols;
        return builder;
      },
      update(payload: unknown) {
        registro.metodo = 'update';
        registro.payload = payload;
        return builder;
      },
      upsert(payload: unknown, opts?: { onConflict?: string }) {
        registro.metodo = 'upsert';
        registro.payload = payload;
        registro.upsertOptions = opts;
        return builder;
      },
      eq(col: string, val: unknown) {
        registro.filtros[col] = val;
        return builder;
      },
      in(col: string, vals: unknown[]) {
        registro.ins[col] = vals;
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        registro.nots.push({ col, op, val });
        return builder;
      },
      or(expr: string) {
        registro.or = expr;
        return builder;
      },
      is(col: string, val: unknown) {
        registro.is[col] = val;
        return builder;
      },
      gt(col: string, val: unknown) {
        registro.gt[col] = val;
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        registro.orders.push({ col, opts });
        return builder;
      },
      range(desde: number, hasta: number) {
        registro.range = { desde, hasta };
        return builder;
      },
      then(onfulfilled: (r: RespuestaFake) => unknown, onrejected?: (e: unknown) => unknown) {
        return Promise.resolve(siguienteRespuesta()).then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  return { from, llamadas };
}

const getSupabaseClientMock = vi.fn();
vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: (...a: unknown[]) => getSupabaseClientMock(...(a as [])),
}));

const { SupabaseKitAvisosEnvioRepository } = await import(
  '@/core/infrastructure/database/supabase-kit-avisos-envio.repository'
);

const EMPRESA_ID = 'empresa-1';

beforeEach(() => {
  getSupabaseClientMock.mockReset();
});

describe('SupabaseKitAvisosEnvioRepository.findEmpresasConAvisos', () => {
  it('empresas.select("id, nombre").eq("kits_caducidad_habilitado", true)', async () => {
    const fake = crearClienteFake([
      { data: [{ id: EMPRESA_ID, nombre: 'KEC' }], error: null },
      { data: [], error: null },
    ]);
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    await repo.findEmpresasConAvisos();

    expect(fake.llamadas[0].tabla).toBe('empresas');
    expect(fake.llamadas[0].select).toBe('id, nombre');
    expect(fake.llamadas[0].filtros).toEqual({ kits_caducidad_habilitado: true });
  });

  it('kit_avisos_config.select("empresa_id, avisos_pausados").in(empresa_id, ids)', async () => {
    const fake = crearClienteFake([
      { data: [{ id: EMPRESA_ID, nombre: 'KEC' }], error: null },
      { data: [], error: null },
    ]);
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    await repo.findEmpresasConAvisos();

    expect(fake.llamadas[1].tabla).toBe('kit_avisos_config');
    expect(fake.llamadas[1].select).toBe('empresa_id, avisos_pausados');
    expect(fake.llamadas[1].ins).toEqual({ empresa_id: [EMPRESA_ID] });
  });

  it('sin fila de config, pausada es false', async () => {
    const fake = crearClienteFake([
      { data: [{ id: EMPRESA_ID, nombre: 'KEC' }], error: null },
      { data: [], error: null },
    ]);
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findEmpresasConAvisos();

    expect(result).toEqual({ success: true, data: [{ id: EMPRESA_ID, nombre: 'KEC', pausada: false }] });
  });

  it('con avisos_pausados: true, pausada es true', async () => {
    const fake = crearClienteFake([
      { data: [{ id: EMPRESA_ID, nombre: 'KEC' }], error: null },
      { data: [{ empresa_id: EMPRESA_ID, avisos_pausados: true }], error: null },
    ]);
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findEmpresasConAvisos();

    expect(result).toEqual({ success: true, data: [{ id: EMPRESA_ID, nombre: 'KEC', pausada: true }] });
  });

  it('sin empresas habilitadas, no llama a kit_avisos_config', async () => {
    const fake = crearClienteFake({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findEmpresasConAvisos();

    expect(fake.llamadas).toHaveLength(1);
    expect(result).toEqual({ success: true, data: [] });
  });

  it('un error de Supabase devuelve success:false', async () => {
    const fake = crearClienteFake({ data: null, error: { message: 'conexión perdida', code: 'DB_ERROR' } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findEmpresasConAvisos();

    expect(result.success).toBe(false);
  });
});

describe('SupabaseKitAvisosEnvioRepository.findKitsConAvisos', () => {
  it('select exacto, eq(empresa_id), not(...) x3, order(serie), range(desde, hasta)', async () => {
    const fake = crearClienteFake({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    await repo.findKitsConAvisos(EMPRESA_ID, 0, 199);

    const llamada = fake.llamadas[0];
    expect(llamada.tabla).toBe('kits_registrados');
    expect(llamada.select).toBe('serie, lote_id, email, baja_token, registrado_at');
    expect(llamada.select).not.toContain('telefono');
    expect(llamada.select).not.toContain('*');
    expect(llamada.filtros).toEqual({ empresa_id: EMPRESA_ID });
    expect(llamada.nots).toEqual([
      { col: 'registrado_at', op: 'is', val: null },
      { col: 'consiente_email_at', op: 'is', val: null },
      { col: 'email', op: 'is', val: null },
    ]);
    expect(llamada.orders).toEqual([{ col: 'serie', opts: undefined }]);
    expect(llamada.range).toEqual({ desde: 0, hasta: 199 });
  });

  it('mapea serie, loteId, email, token (de baja_token) y registradoAt', async () => {
    const fake = crearClienteFake({
      data: [{ serie: 'KEC-1', lote_id: 'lote-1', email: 'ana@ejemplo.com', baja_token: 'tok-1', registrado_at: '2026-11-01T00:00:00.000Z' }],
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findKitsConAvisos(EMPRESA_ID, 0, 199);

    expect(result).toEqual({
      success: true,
      data: [{ serie: 'KEC-1', loteId: 'lote-1', email: 'ana@ejemplo.com', token: 'tok-1', registradoAt: '2026-11-01T00:00:00.000Z' }],
    });
  });

  it('un error de Supabase devuelve success:false sin email ni token en el mensaje', async () => {
    const fake = crearClienteFake({ data: null, error: { message: 'conexión perdida', code: 'DB_ERROR' } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findKitsConAvisos(EMPRESA_ID, 0, 199);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain('@');
    }
  });
});

describe('SupabaseKitAvisosEnvioRepository.findLotesKit', () => {
  it('kit_lotes.select("id, productos(titulo_es, slug)").eq(empresa_id).in(id, loteIds)', async () => {
    const fake = crearClienteFake({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    await repo.findLotesKit(EMPRESA_ID, ['lote-1', 'lote-2']);

    const llamada = fake.llamadas[0];
    expect(llamada.tabla).toBe('kit_lotes');
    expect(llamada.select).toBe('id, productos(titulo_es, slug)');
    expect(llamada.filtros).toEqual({ empresa_id: EMPRESA_ID });
    expect(llamada.ins).toEqual({ id: ['lote-1', 'lote-2'] });
  });

  it('mapea loteId, kitNombre y kitSlug (null si el producto no tiene slug)', async () => {
    const fake = crearClienteFake({
      data: [{ id: 'lote-1', productos: { titulo_es: 'Kit básico', slug: 'kit-basico' } }, { id: 'lote-2', productos: { titulo_es: 'Kit pro', slug: null } }],
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findLotesKit(EMPRESA_ID, ['lote-1', 'lote-2']);

    expect(result).toEqual({
      success: true,
      data: [
        { loteId: 'lote-1', kitNombre: 'Kit básico', kitSlug: 'kit-basico' },
        { loteId: 'lote-2', kitNombre: 'Kit pro', kitSlug: null },
      ],
    });
  });

  it('un error de Supabase devuelve success:false', async () => {
    const fake = crearClienteFake({ data: null, error: { message: 'conexión perdida', code: 'DB_ERROR' } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosEnvioRepository();

    const result = await repo.findLotesKit(EMPRESA_ID, ['lote-1']);

    expect(result.success).toBe(false);
  });
});
