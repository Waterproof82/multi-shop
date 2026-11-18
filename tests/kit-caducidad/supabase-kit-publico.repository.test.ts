/**
 * sdd kit-expiry-m2a (docs/sdd/kit-expiry-reminders/m2a/), DD6 de design.md:
 * `findKitPublico` resuelve la serie pública en DOS consultas (sin embed por
 * la FK compuesta) y nunca selecciona ninguna columna con datos personales
 * de `kits_registrados` (R-M2a.2.1) — ni siquiera revela si la serie está
 * registrada. `findCaducidadesEfectivas` lee la vista
 * `kit_lote_caducidades_efectivas` (R-M2a.2.3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LlamadaFake {
  tabla: string;
  select?: string;
  filtros: Record<string, unknown>;
}

interface RespuestaFake {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function crearClienteFake(respuestasPorTabla: Record<string, RespuestaFake>) {
  const llamadas: LlamadaFake[] = [];

  function from(tabla: string) {
    const registro: LlamadaFake = { tabla, filtros: {} };
    llamadas.push(registro);

    const respuesta = (): RespuestaFake => respuestasPorTabla[tabla] ?? { data: null, error: null };

    const builder = {
      select(cols?: string) {
        registro.select = cols;
        return builder;
      },
      eq(col: string, val: unknown) {
        registro.filtros[col] = val;
        return builder;
      },
      async maybeSingle() {
        return respuesta();
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

const { SupabaseKitCaducidadRepository, mapCaducidadEfectiva } = await import(
  '@/core/infrastructure/database/supabase-kit-caducidad.repository'
);

const EMPRESA_ID = 'empresa-1';
const SERIE = 'KEC-ABCD-1234-X';

beforeEach(() => {
  getSupabaseClientMock.mockReset();
});

describe('SupabaseKitCaducidadRepository.findKitPublico', () => {
  it('el select de kits_registrados es exactamente "lote_id"', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: { lote_id: 'lote-1' }, error: null },
      kit_lotes: { data: { productos: { titulo_es: 'Kit Estándar 72h', slug: 'kit-estandar-72h' } }, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    await repo.findKitPublico(EMPRESA_ID, SERIE);

    const llamadaRegistrados = fake.llamadas.find((l) => l.tabla === 'kits_registrados');
    expect(llamadaRegistrados?.select).toBe('lote_id');
  });

  it('ningún select contiene email, telefono, consiente, baja_token ni *', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: { lote_id: 'lote-1' }, error: null },
      kit_lotes: { data: { productos: { titulo_es: 'Kit Estándar 72h', slug: 'kit-estandar-72h' } }, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    await repo.findKitPublico(EMPRESA_ID, SERIE);

    for (const llamada of fake.llamadas) {
      expect(llamada.select ?? '').not.toMatch(/email|telefono|consiente|baja_token|\*/);
    }
  });

  it('filtra kits_registrados por empresa_id y serie', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: { lote_id: 'lote-1' }, error: null },
      kit_lotes: { data: { productos: { titulo_es: 'Kit Estándar 72h', slug: 'kit-estandar-72h' } }, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    await repo.findKitPublico(EMPRESA_ID, SERIE);

    const llamadaRegistrados = fake.llamadas.find((l) => l.tabla === 'kits_registrados');
    expect(llamadaRegistrados?.filtros).toEqual({ empresa_id: EMPRESA_ID, serie: SERIE });
  });

  it('sin fila en kits_registrados, devuelve null sin consultar kit_lotes', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: null, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    const result = await repo.findKitPublico(EMPRESA_ID, SERIE);

    expect(result).toEqual({ success: true, data: null });
    expect(fake.llamadas.some((l) => l.tabla === 'kit_lotes')).toBe(false);
  });

  it('con fila, consulta kit_lotes con productos(titulo_es, slug), filtra por empresa_id/id y mapea el resultado', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: { lote_id: 'lote-1' }, error: null },
      kit_lotes: { data: { productos: { titulo_es: 'Kit Estándar 72h', slug: 'kit-estandar-72h' } }, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    const result = await repo.findKitPublico(EMPRESA_ID, SERIE);

    const llamadaLotes = fake.llamadas.find((l) => l.tabla === 'kit_lotes');
    expect(llamadaLotes?.select).toBe('productos(titulo_es, slug)');
    expect(llamadaLotes?.filtros).toEqual({ empresa_id: EMPRESA_ID, id: 'lote-1' });
    expect(result).toEqual({
      success: true,
      data: { loteId: 'lote-1', kitNombre: 'Kit Estándar 72h', kitSlug: 'kit-estandar-72h' },
    });
  });

  it('con fila, kitSlug es null cuando el producto no tiene slug', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: { lote_id: 'lote-1' }, error: null },
      kit_lotes: { data: { productos: { titulo_es: 'Kit Estándar 72h', slug: null } }, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    const result = await repo.findKitPublico(EMPRESA_ID, SERIE);

    expect(result).toEqual({
      success: true,
      data: { loteId: 'lote-1', kitNombre: 'Kit Estándar 72h', kitSlug: null },
    });
  });

  it('un error de Supabase devuelve success:false y el mensaje no lleva la serie completa', async () => {
    const fake = crearClienteFake({
      kits_registrados: { data: null, error: { message: 'conexión perdida', code: 'DB_ERROR' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    const result = await repo.findKitPublico(EMPRESA_ID, SERIE);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain(SERIE);
    }
  });
});

describe('SupabaseKitCaducidadRepository.findCaducidadesEfectivas', () => {
  it('consulta kit_lote_caducidades_efectivas filtrando por empresa_id y lote_id, y mapea las filas', async () => {
    const fake = crearClienteFake({
      kit_lote_caducidades_efectivas: {
        data: [
          { lote_id: 'lote-1', empresa_id: EMPRESA_ID, ingrediente_id: 'ing-1', consumible: 'Pastillas potabilizadoras', parte: '', caduca_el: '2031-03-01' },
          { lote_id: 'lote-1', empresa_id: EMPRESA_ID, ingrediente_id: 'ing-2', consumible: 'Botiquín', parte: 'Gasas estériles', caduca_el: '2031-02-10' },
        ],
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    const result = await repo.findCaducidadesEfectivas(EMPRESA_ID, 'lote-1');

    const llamada = fake.llamadas.find((l) => l.tabla === 'kit_lote_caducidades_efectivas');
    expect(llamada?.filtros).toEqual({ empresa_id: EMPRESA_ID, lote_id: 'lote-1' });
    expect(result).toEqual({
      success: true,
      data: [
        { ingredienteId: 'ing-1', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-01' },
        { ingredienteId: 'ing-2', consumible: 'Botiquín', parte: 'Gasas estériles', caducaEl: '2031-02-10' },
      ],
    });
  });

  it('un error de Supabase devuelve success:false', async () => {
    const fake = crearClienteFake({
      kit_lote_caducidades_efectivas: { data: null, error: { message: 'conexión perdida' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabaseKitCaducidadRepository();

    const result = await repo.findCaducidadesEfectivas(EMPRESA_ID, 'lote-1');

    expect(result.success).toBe(false);
  });
});

describe('mapCaducidadEfectiva', () => {
  it('mapea una fila de la vista a Caducidad', () => {
    expect(
      mapCaducidadEfectiva({
        lote_id: 'lote-1',
        empresa_id: EMPRESA_ID,
        ingrediente_id: 'ing-1',
        consumible: 'Pastillas potabilizadoras',
        parte: '',
        caduca_el: '2031-03-01',
      }),
    ).toEqual({ ingredienteId: 'ing-1', consumible: 'Pastillas potabilizadoras', parte: '', caducaEl: '2031-03-01' });
  });
});
