/**
 * sdd pet-id-qr-profile, Fase 5 (design.md DD1/DD7): el admin nunca ve PII.
 * `insertCodigosIgnorandoDuplicados` y `createLote` filtran siempre por
 * `empresa_id` y nunca seleccionan `*`; `countPorEstado` hace tres recuentos
 * `head: true` que nunca devuelven una fila con un dato personal. Calco del
 * patrón de `supabase-kit-publico.repository.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LlamadaFake {
  tabla: string;
  select?: string;
  opciones?: Record<string, unknown>;
  filtros: Record<string, unknown>;
  nulos: Record<string, boolean>;
  noNulos: Record<string, boolean>;
  insertado?: unknown;
  upsertado?: unknown;
  upsertOpciones?: Record<string, unknown>;
  actualizado?: Record<string, unknown>;
  orden?: Record<string, unknown>;
  rango?: { desde: number; hasta: number };
}

interface RespuestaFake {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

function crearClienteFake(respuestasPorTabla: Record<string, RespuestaFake>) {
  const llamadas: LlamadaFake[] = [];

  function from(tabla: string) {
    const registro: LlamadaFake = { tabla, filtros: {}, nulos: {}, noNulos: {} };
    llamadas.push(registro);

    const respuesta = (): RespuestaFake => respuestasPorTabla[tabla] ?? { data: null, error: null };

    const builder = {
      select(cols?: string, opciones?: Record<string, unknown>) {
        registro.select = cols;
        registro.opciones = opciones;
        return builder;
      },
      insert(payload: unknown) {
        registro.insertado = payload;
        return builder;
      },
      upsert(payload: unknown, opciones?: Record<string, unknown>) {
        registro.upsertado = payload;
        registro.upsertOpciones = opciones;
        return builder;
      },
      update(payload: Record<string, unknown>) {
        registro.actualizado = payload;
        return builder;
      },
      eq(col: string, val: unknown) {
        registro.filtros[col] = val;
        return builder;
      },
      is(col: string, val: unknown) {
        if (val === null) registro.nulos[col] = true;
        return builder;
      },
      not(col: string, _op: string, val: unknown) {
        if (val === null) registro.noNulos[col] = true;
        return builder;
      },
      order(col: string, opciones?: Record<string, unknown>) {
        registro.orden = { col, ...opciones };
        return builder;
      },
      range(desde: number, hasta: number) {
        registro.rango = { desde, hasta };
        return builder;
      },
      async maybeSingle() {
        const r = respuesta();
        return { data: r.data, error: r.error };
      },
      async single() {
        const r = respuesta();
        return { data: r.data, error: r.error };
      },
      then(onfulfilled: (r: RespuestaFake) => unknown, onrejected?: (e: unknown) => unknown) {
        return Promise.resolve(respuesta()).then(onfulfilled, onrejected);
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

const { SupabasePetChapaAdminRepository, mapPetChapaPgError } = await import(
  '@/core/infrastructure/database/supabase-pet-chapa-admin.repository'
);

const EMPRESA_ID = 'empresa-1';
const LOTE_ID = 'lote-1';

beforeEach(() => {
  getSupabaseClientMock.mockReset();
});

describe('SupabasePetChapaAdminRepository.createLote', () => {
  it('inserta con empresa_id y producto_id, sin seleccionar `*`', async () => {
    const fake = crearClienteFake({
      pet_chapa_lotes: {
        data: { id: LOTE_ID, empresa_id: EMPRESA_ID, producto_id: 'producto-1', codigo: 'L01', created_at: '2026-11-20T00:00:00Z' },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.createLote(EMPRESA_ID, { productoId: 'producto-1', codigo: 'L01' });

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapa_lotes');
    expect(llamada?.insertado).toEqual({ empresa_id: EMPRESA_ID, producto_id: 'producto-1', codigo: 'L01' });
    expect(llamada?.select ?? '').not.toMatch(/\*/);
    expect(result).toEqual({
      success: true,
      data: { id: LOTE_ID, empresaId: EMPRESA_ID, productoId: 'producto-1', codigo: 'L01', createdAt: '2026-11-20T00:00:00Z' },
    });
  });

  it('un 23503 (trigger: producto de otra empresa) se traduce a VALIDATION_ERROR', async () => {
    const fake = crearClienteFake({
      pet_chapa_lotes: { data: null, error: { message: 'violates foreign key', code: '23503' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.createLote(EMPRESA_ID, { productoId: 'producto-ajeno', codigo: 'L01' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('un 23505 (código duplicado) se traduce a CONFLICT', async () => {
    const fake = crearClienteFake({
      pet_chapa_lotes: { data: null, error: { message: 'duplicate key', code: '23505' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.createLote(EMPRESA_ID, { productoId: 'producto-1', codigo: 'L01' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('CONFLICT');
  });
});

describe('SupabasePetChapaAdminRepository.findLoteById', () => {
  it('filtra por empresa_id e id, nunca por *', async () => {
    const fake = crearClienteFake({ pet_chapa_lotes: { data: null, error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    await repo.findLoteById(EMPRESA_ID, LOTE_ID);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapa_lotes');
    expect(llamada?.filtros).toEqual({ empresa_id: EMPRESA_ID, id: LOTE_ID });
    expect(llamada?.select ?? '').not.toMatch(/\*/);
  });
});

describe('SupabasePetChapaAdminRepository.insertCodigosIgnorandoDuplicados', () => {
  it('cada fila lleva empresa_id y lote_id, nunca ningún campo de perfil (email, nombre, foto...)', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: [{ codigo: 'M-AAAA-1111-X' }, { codigo: 'M-BBBB-2222-Y' }], error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.insertCodigosIgnorandoDuplicados(EMPRESA_ID, LOTE_ID, ['M-AAAA-1111-X', 'M-BBBB-2222-Y']);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapas');
    expect(llamada?.upsertado).toEqual([
      { codigo: 'M-AAAA-1111-X', empresa_id: EMPRESA_ID, lote_id: LOTE_ID },
      { codigo: 'M-BBBB-2222-Y', empresa_id: EMPRESA_ID, lote_id: LOTE_ID },
    ]);
    expect(llamada?.upsertOpciones).toEqual({ onConflict: 'codigo', ignoreDuplicates: true });
    expect(llamada?.select).toBe('codigo');
    expect(result).toEqual({ success: true, data: ['M-AAAA-1111-X', 'M-BBBB-2222-Y'] });
  });
});

describe('SupabasePetChapaAdminRepository.countPorEstado', () => {
  it('hace 3 recuentos head:true filtrados por empresa_id/lote_id, ningún select con PII', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: null, error: null, count: 3 },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.countPorEstado(EMPRESA_ID, LOTE_ID);

    const llamadas = fake.llamadas.filter((l) => l.tabla === 'pet_chapas');
    expect(llamadas).toHaveLength(3);
    for (const llamada of llamadas) {
      expect(llamada.filtros).toMatchObject({ empresa_id: EMPRESA_ID, lote_id: LOTE_ID });
      expect(llamada.opciones).toEqual({ count: 'exact', head: true });
      expect(llamada.select ?? '').not.toMatch(/email|telefono|nombre|notas_salud|foto_clave|gestion_token|\*/);
    }
    expect(result).toEqual({ success: true, data: { libre: 3, pendiente: 3, activa: 3 } });
  });

  it('distingue libre (email null) de pendiente (email no-null, confirmado_at null) y activa (confirmado_at no-null)', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: null, count: 0 } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    await repo.countPorEstado(EMPRESA_ID, LOTE_ID);

    const llamadas = fake.llamadas.filter((l) => l.tabla === 'pet_chapas');
    const libre = llamadas.find((l) => l.nulos.email);
    const pendiente = llamadas.find((l) => l.noNulos.email && l.nulos.confirmado_at);
    const activa = llamadas.find((l) => l.noNulos.confirmado_at);

    expect(libre).toBeDefined();
    expect(pendiente).toBeDefined();
    expect(activa).toBeDefined();
  });

  it('un error de Supabase en cualquiera de los tres recuentos devuelve success:false', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: null, error: { message: 'conexión perdida' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.countPorEstado(EMPRESA_ID, LOTE_ID);

    expect(result.success).toBe(false);
  });
});

describe('SupabasePetChapaAdminRepository.borrarDatos', () => {
  const CODIGO = 'M-AAAA-1111-X';

  it('hace un update con las 13 columnas de perfil a null, filtra por empresa_id/codigo/email no nulo', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: [{ codigo: CODIGO }], error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.borrarDatos(EMPRESA_ID, CODIGO);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapas');
    expect(llamada?.filtros).toEqual({ empresa_id: EMPRESA_ID, codigo: CODIGO });
    expect(llamada?.noNulos.email).toBe(true);
    expect(llamada?.select).toBe('codigo');
    expect(result).toEqual({ success: true, data: { codigo: CODIGO } });
  });

  it('nulea exactamente email, idioma, gestion_token, consiente_perfil_at, texto_consentimiento_version, confirmado_at, nombre, especie, notas_salud, foto_clave, telefono, telefono_consentido_at y telefono_texto_version', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [{ codigo: CODIGO }], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    await repo.borrarDatos(EMPRESA_ID, CODIGO);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapas');
    expect(llamada?.actualizado).toEqual({
      email: null,
      idioma: null,
      gestion_token: null,
      consiente_perfil_at: null,
      texto_consentimiento_version: null,
      confirmado_at: null,
      nombre: null,
      especie: null,
      notas_salud: null,
      foto_clave: null,
      telefono: null,
      telefono_consentido_at: null,
      telefono_texto_version: null,
    });
  });

  it('0 filas (ya libre o código inexistente) devuelve data: null', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.borrarDatos(EMPRESA_ID, CODIGO);

    expect(result).toEqual({ success: true, data: null });
  });

  it('un error de Supabase devuelve success:false', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: { message: 'conexión perdida' } } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.borrarDatos(EMPRESA_ID, CODIGO);

    expect(result.success).toBe(false);
  });
});

describe('SupabasePetChapaAdminRepository.findLotes', () => {
  it('pagina por empresa_id, ordena por created_at desc y nunca selecciona *', async () => {
    const fake = crearClienteFake({
      pet_chapa_lotes: {
        data: [{ id: LOTE_ID, empresa_id: EMPRESA_ID, producto_id: 'producto-1', codigo: 'L01', created_at: '2026-11-20T00:00:00Z', productos: { titulo_es: 'Chapa QR' } }],
        error: null,
        count: 1,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.findLotes(EMPRESA_ID, { page: 1, pageSize: 50 });

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapa_lotes');
    expect(llamada?.filtros).toEqual({ empresa_id: EMPRESA_ID });
    expect(llamada?.orden).toEqual({ col: 'created_at', ascending: false });
    expect(llamada?.rango).toEqual({ desde: 0, hasta: 49 });
    expect(llamada?.select ?? '').not.toMatch(/(^|[^a-z_])\*/);
    expect(result).toEqual({
      success: true,
      data: {
        items: [{ id: LOTE_ID, empresaId: EMPRESA_ID, productoId: 'producto-1', codigo: 'L01', createdAt: '2026-11-20T00:00:00Z', productoNombre: 'Chapa QR' }],
        total: 1,
        page: 1,
        pageSize: 50,
      },
    });
  });

  it('calcula el rango de la segunda página', async () => {
    const fake = crearClienteFake({ pet_chapa_lotes: { data: [], error: null, count: 0 } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    await repo.findLotes(EMPRESA_ID, { page: 2, pageSize: 20 });

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapa_lotes');
    expect(llamada?.rango).toEqual({ desde: 20, hasta: 39 });
  });

  it('un error de Supabase devuelve success:false', async () => {
    const fake = crearClienteFake({ pet_chapa_lotes: { data: null, error: { message: 'conexión perdida' } } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.findLotes(EMPRESA_ID, { page: 1, pageSize: 50 });

    expect(result.success).toBe(false);
  });
});

describe('SupabasePetChapaAdminRepository.findCodigosDeLote', () => {
  it('filtra por empresa_id/lote_id, ordena por created_at ascendente y selecciona solo codigo', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: [{ codigo: 'M-AAAA-1111-X' }, { codigo: 'M-BBBB-2222-Y' }], error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.findCodigosDeLote(EMPRESA_ID, LOTE_ID);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapas');
    expect(llamada?.filtros).toEqual({ empresa_id: EMPRESA_ID, lote_id: LOTE_ID });
    expect(llamada?.orden).toEqual({ col: 'created_at', ascending: true });
    expect(llamada?.select).toBe('codigo');
    expect(result).toEqual({ success: true, data: ['M-AAAA-1111-X', 'M-BBBB-2222-Y'] });
  });

  it('un error de Supabase devuelve success:false', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: { message: 'conexión perdida' } } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaAdminRepository();

    const result = await repo.findCodigosDeLote(EMPRESA_ID, LOTE_ID);

    expect(result.success).toBe(false);
  });
});

describe('mapPetChapaPgError', () => {
  it('código desconocido cae en DB_ERROR', () => {
    const error = mapPetChapaPgError({ message: 'algo raro' }, 'test');
    expect(error.code).toBe('DB_ERROR');
  });
});
