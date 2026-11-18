/**
 * sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), DD1/DD2 de
 * design.md: repositorio nuevo del alta/confirmación/baja de avisos.
 * Cliente simulado local (mismo patrón que
 * `supabase-kit-publico.repository.test.ts`, M2a), ampliado con
 * `update`/`or`/`is`/`gt` para capturar la cadena real de PostgREST.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LlamadaFake {
  tabla: string;
  metodo: 'select' | 'update' | null;
  payload?: Record<string, unknown>;
  select?: string;
  filtros: Record<string, unknown>;
  or?: string;
  is: Record<string, unknown>;
  gt: Record<string, unknown>;
}

interface RespuestaFake {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function crearClienteFake(respuesta: RespuestaFake) {
  const llamadas: LlamadaFake[] = [];

  function from(tabla: string) {
    const registro: LlamadaFake = { tabla, metodo: null, filtros: {}, is: {}, gt: {} };
    llamadas.push(registro);

    const builder = {
      select(cols?: string) {
        registro.metodo ??= 'select';
        registro.select = cols;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        registro.metodo = 'update';
        registro.payload = payload;
        return builder;
      },
      eq(col: string, val: unknown) {
        registro.filtros[col] = val;
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
      async maybeSingle() {
        return respuesta;
      },
      then(onfulfilled: (r: RespuestaFake) => unknown, onrejected?: (e: unknown) => unknown) {
        return Promise.resolve(respuesta).then(onfulfilled, onrejected);
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

const { SupabaseKitAvisosRepository } = await import('@/core/infrastructure/database/supabase-kit-avisos.repository');

const EMPRESA_ID = 'empresa-1';
const SERIE = 'KEC-ABCD-1234-5';
const TOKEN = 'a'.repeat(43);
const LIMITE = '2026-11-16T12:00:00.000Z';

beforeEach(() => {
  getSupabaseClientMock.mockReset();
});

describe('SupabaseKitAvisosRepository.reservarAlta', () => {
  function input(overrides: Partial<Parameters<typeof SupabaseKitAvisosRepository.prototype.reservarAlta>[1]> = {}) {
    return {
      serie: SERIE,
      email: 'ana@ejemplo.com',
      telefono: null,
      whatsapp: false,
      version: 'kit-avisos-v1',
      token: TOKEN,
      ahora: '2026-11-18T12:00:00.000Z',
      pendienteCaducaAntesDe: LIMITE,
      ...overrides,
    };
  }

  it('hace un update con email, telefono, consiente_email_at, version, baja_token y registrado_at: null', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.reservarAlta(EMPRESA_ID, input());

    const llamada = fake.llamadas[0];
    expect(llamada.payload).toEqual({
      email: 'ana@ejemplo.com',
      telefono: null,
      consiente_email_at: '2026-11-18T12:00:00.000Z',
      consiente_whatsapp_at: null,
      texto_consentimiento_version: 'kit-avisos-v1',
      baja_token: TOKEN,
      registrado_at: null,
    });
  });

  it('consiente_whatsapp_at es la hora actual cuando whatsapp: true, y null si no se marcó', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.reservarAlta(EMPRESA_ID, input({ whatsapp: true, telefono: '+34600111222' }));

    expect(fake.llamadas[0].payload?.consiente_whatsapp_at).toBe('2026-11-18T12:00:00.000Z');
  });

  it('filtra por empresa_id y serie', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].filtros).toEqual({ empresa_id: EMPRESA_ID, serie: SERIE });
  });

  it('el or() es exactamente email.is.null,and(registrado_at.is.null,consiente_email_at.lt."<ISO>") con el ISO entre comillas', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].or).toBe(
      `email.is.null,and(registrado_at.is.null,consiente_email_at.lt."${LIMITE}")`,
    );
  });

  it('select("serie") con 1 fila devuelve true', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].select).toBe('serie');
    expect(result).toEqual({ success: true, data: true });
  });

  it('con 0 filas devuelve false', async () => {
    const fake = crearClienteFake({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.reservarAlta(EMPRESA_ID, input());

    expect(result).toEqual({ success: true, data: false });
  });

  it('un error de Supabase devuelve success:false sin filtrar la serie completa, el email ni el token', async () => {
    const fake = crearClienteFake({ data: null, error: { message: 'conexión perdida', code: 'DB_ERROR' } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.reservarAlta(EMPRESA_ID, input());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain(SERIE);
      expect(result.error.message).not.toContain('ana@ejemplo.com');
      expect(result.error.message).not.toContain(TOKEN);
    }
  });
});

describe('SupabaseKitAvisosRepository.findContacto', () => {
  it('selecciona exactamente "email, registrado_at, baja_token", nunca *', async () => {
    const fake = crearClienteFake({ data: { email: 'ana@ejemplo.com', registrado_at: null, baja_token: TOKEN }, error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.findContacto(EMPRESA_ID, SERIE);

    expect(fake.llamadas[0].select).toBe('email, registrado_at, baja_token');
    expect(fake.llamadas[0].select).not.toContain('*');
  });

  it('con email devuelve estado pendiente cuando registrado_at es null', async () => {
    const fake = crearClienteFake({ data: { email: 'ana@ejemplo.com', registrado_at: null, baja_token: TOKEN }, error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findContacto(EMPRESA_ID, SERIE);

    expect(result).toEqual({ success: true, data: { estado: 'pendiente', email: 'ana@ejemplo.com', token: TOKEN } });
  });

  it('con registrado_at devuelve estado registrada', async () => {
    const fake = crearClienteFake({
      data: { email: 'ana@ejemplo.com', registrado_at: '2026-11-01T00:00:00.000Z', baja_token: TOKEN },
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findContacto(EMPRESA_ID, SERIE);

    expect(result).toEqual({
      success: true,
      data: { estado: 'registrada', email: 'ana@ejemplo.com', token: TOKEN },
    });
  });

  it('con email null (serie libre o inexistente) devuelve null', async () => {
    const fake = crearClienteFake({ data: { email: null, registrado_at: null, baja_token: null }, error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findContacto(EMPRESA_ID, SERIE);

    expect(result).toEqual({ success: true, data: null });
  });

  it('sin fila devuelve null', async () => {
    const fake = crearClienteFake({ data: null, error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findContacto(EMPRESA_ID, SERIE);

    expect(result).toEqual({ success: true, data: null });
  });
});

describe('SupabaseKitAvisosRepository.findPorToken', () => {
  it('filtra por empresa_id y baja_token', async () => {
    const fake = crearClienteFake({
      data: { serie: SERIE, registrado_at: null, texto_consentimiento_version: 'kit-avisos-v1', consiente_email_at: '2026-11-18T00:00:00.000Z' },
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.findPorToken(EMPRESA_ID, TOKEN, LIMITE);

    expect(fake.llamadas[0].filtros).toEqual({ empresa_id: EMPRESA_ID, baja_token: TOKEN });
  });

  it('un alta pendiente caducada (consiente_email_at antes del límite) devuelve null', async () => {
    const fake = crearClienteFake({
      data: { serie: SERIE, registrado_at: null, texto_consentimiento_version: 'kit-avisos-v1', consiente_email_at: '2026-11-10T00:00:00.000Z' },
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findPorToken(EMPRESA_ID, TOKEN, LIMITE);

    expect(result).toEqual({ success: true, data: null });
  });

  it('un alta pendiente vigente devuelve estado pendiente', async () => {
    const fake = crearClienteFake({
      data: { serie: SERIE, registrado_at: null, texto_consentimiento_version: 'kit-avisos-v1', consiente_email_at: '2026-11-18T13:00:00.000Z' },
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findPorToken(EMPRESA_ID, TOKEN, LIMITE);

    expect(result).toEqual({ success: true, data: { serie: SERIE, estado: 'pendiente', version: 'kit-avisos-v1' } });
  });

  it('una serie registrada devuelve estado registrada sin comprobar caducidad', async () => {
    const fake = crearClienteFake({
      data: { serie: SERIE, registrado_at: '2026-11-01T00:00:00.000Z', texto_consentimiento_version: 'kit-avisos-v1', consiente_email_at: '2026-10-01T00:00:00.000Z' },
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findPorToken(EMPRESA_ID, TOKEN, LIMITE);

    expect(result).toEqual({ success: true, data: { serie: SERIE, estado: 'registrada', version: 'kit-avisos-v1' } });
  });

  it('un token desconocido en esta empresa devuelve null', async () => {
    const fake = crearClienteFake({ data: null, error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findPorToken(EMPRESA_ID, TOKEN, LIMITE);

    expect(result).toEqual({ success: true, data: null });
  });

  it('el resultado no tiene email', async () => {
    const fake = crearClienteFake({
      data: { serie: SERIE, registrado_at: null, texto_consentimiento_version: 'kit-avisos-v1', consiente_email_at: '2026-11-18T13:00:00.000Z' },
      error: null,
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.findPorToken(EMPRESA_ID, TOKEN, LIMITE);

    expect(result.success && result.data ? 'email' in result.data : false).toBe(false);
  });
});

describe('SupabaseKitAvisosRepository.confirmar', () => {
  it('hace un update con registrado_at, filtrando por empresa_id y baja_token, con is(registrado_at, null) y gt(consiente_email_at, limite)', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE, texto_consentimiento_version: 'kit-avisos-v1' }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.confirmar(EMPRESA_ID, TOKEN, LIMITE);

    const llamada = fake.llamadas[0];
    expect(Object.keys(llamada.payload ?? {})).toEqual(['registrado_at']);
    expect(llamada.filtros).toEqual({ empresa_id: EMPRESA_ID, baja_token: TOKEN });
    expect(llamada.is).toEqual({ registrado_at: null });
    expect(llamada.gt).toEqual({ consiente_email_at: LIMITE });
  });

  it('con 1 fila devuelve estado registrada', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE, texto_consentimiento_version: 'kit-avisos-v1' }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.confirmar(EMPRESA_ID, TOKEN, LIMITE);

    expect(result).toEqual({ success: true, data: { serie: SERIE, estado: 'registrada', version: 'kit-avisos-v1' } });
  });

  it('con 0 filas (ya caducado, ya confirmado o token inexistente) devuelve null', async () => {
    const fake = crearClienteFake({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.confirmar(EMPRESA_ID, TOKEN, LIMITE);

    expect(result).toEqual({ success: true, data: null });
  });
});

describe('SupabaseKitAvisosRepository.borrar', () => {
  it('pone a NULL email, telefono, los dos consiente_*_at, la versión, baja_token y registrado_at', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.borrar(EMPRESA_ID, TOKEN);

    expect(fake.llamadas[0].payload).toEqual({
      email: null,
      telefono: null,
      consiente_email_at: null,
      consiente_whatsapp_at: null,
      texto_consentimiento_version: null,
      baja_token: null,
      registrado_at: null,
    });
  });

  it('filtra por empresa_id y baja_token', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    await repo.borrar(EMPRESA_ID, TOKEN);

    expect(fake.llamadas[0].filtros).toEqual({ empresa_id: EMPRESA_ID, baja_token: TOKEN });
  });

  it('con 1 fila devuelve la serie', async () => {
    const fake = crearClienteFake({ data: [{ serie: SERIE }], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.borrar(EMPRESA_ID, TOKEN);

    expect(result).toEqual({ success: true, data: { serie: SERIE } });
  });

  it('con 0 filas (token ya usado o inexistente) devuelve null', async () => {
    const fake = crearClienteFake({ data: [], error: null });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.borrar(EMPRESA_ID, TOKEN);

    expect(result).toEqual({ success: true, data: null });
  });

  it('un error de Supabase devuelve success:false sin filtrar el token', async () => {
    const fake = crearClienteFake({ data: null, error: { message: 'conexión perdida', code: 'DB_ERROR' } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitAvisosRepository();

    const result = await repo.borrar(EMPRESA_ID, TOKEN);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain(TOKEN);
    }
  });
});
