/**
 * sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
 * Fase 9 (design.md DD1/R-QR.3/R-QR.6/R-QR.7): `findPerfilActivo` siempre
 * filtra por `empresa_id` y `confirmado_at IS NOT NULL`, nunca selecciona
 * `*`, nunca selecciona `email` ni `gestion_token`, y solo expone el
 * teléfono cuando `telefono_consentido_at` está marcado. Calco del patrón
 * de `supabase-pet-chapa-admin.repository.test.ts`.
 *
 * Fase 10 (DD5): el builder se amplía con `update`/`or`/`then` (calco del
 * de `supabase-kit-avisos.repository.test.ts`) para `reservarAlta` y
 * `findContacto`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LlamadaFake {
  tabla: string;
  metodo: 'select' | 'update' | null;
  payload?: Record<string, unknown>;
  select?: string;
  filtros: Record<string, unknown>;
  noNulos: Record<string, boolean>;
  or?: string;
}

interface RespuestaFake {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function crearClienteFake(respuestasPorTabla: Record<string, RespuestaFake>) {
  const llamadas: LlamadaFake[] = [];

  function from(tabla: string) {
    const registro: LlamadaFake = { tabla, metodo: null, filtros: {}, noNulos: {} };
    llamadas.push(registro);

    const respuesta = (): RespuestaFake => respuestasPorTabla[tabla] ?? { data: null, error: null };

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
      not(col: string, _op: string, val: unknown) {
        if (val === null) registro.noNulos[col] = true;
        return builder;
      },
      async maybeSingle() {
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

const { SupabasePetChapaPerfilRepository } = await import(
  '@/core/infrastructure/database/supabase-pet-chapa-perfil.repository'
);

const EMPRESA_ID = 'empresa-1';
const CODIGO = 'M-ABCD-1234-5';

beforeEach(() => {
  getSupabaseClientMock.mockReset();
  delete process.env.NEXT_PUBLIC_R2_DOMAIN;
});

describe('SupabasePetChapaPerfilRepository.findPerfilActivo', () => {
  it('filtra por empresa_id y codigo, exige confirmado_at no nulo, y nunca selecciona `*`', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: null, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapas');
    expect(llamada?.filtros).toEqual({ empresa_id: EMPRESA_ID, codigo: CODIGO });
    expect(llamada?.noNulos.confirmado_at).toBe(true);
    expect(llamada?.select ?? '').not.toMatch(/\*/);
  });

  it('nunca selecciona email ni gestion_token', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    const llamada = fake.llamadas.find((l) => l.tabla === 'pet_chapas');
    expect(llamada?.select ?? '').not.toMatch(/\bemail\b/);
    expect(llamada?.select ?? '').not.toMatch(/gestion_token/);
  });

  it('sin fila (libre, pendiente o inexistente) → data: null', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    expect(result).toEqual({ success: true, data: null });
  });

  it('chapa activa sin consentimiento de teléfono → telefono: null aunque la columna tenga valor', async () => {
    const fake = crearClienteFake({
      pet_chapas: {
        data: {
          nombre: 'Luna',
          especie: 'perro',
          notas_salud: 'Alérgica a la penicilina',
          foto_clave: null,
          telefono: '+34600000000',
          telefono_consentido_at: null,
        },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    expect(result).toEqual({
      success: true,
      data: { nombre: 'Luna', especie: 'perro', notas: 'Alérgica a la penicilina', fotoUrl: null, telefono: null },
    });
  });

  it('chapa activa con consentimiento de teléfono → telefono visible', async () => {
    const fake = crearClienteFake({
      pet_chapas: {
        data: {
          nombre: 'Rex',
          especie: 'gato',
          notas_salud: null,
          foto_clave: null,
          telefono: '+34600000000',
          telefono_consentido_at: '2026-11-20T00:00:00Z',
        },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    expect(result).toEqual({
      success: true,
      data: { nombre: 'Rex', especie: 'gato', notas: null, fotoUrl: null, telefono: '+34600000000' },
    });
  });

  it('con foto_clave y NEXT_PUBLIC_R2_DOMAIN configurado, construye fotoUrl', async () => {
    process.env.NEXT_PUBLIC_R2_DOMAIN = 'https://cdn.example.com';
    const fake = crearClienteFake({
      pet_chapas: {
        data: {
          nombre: 'Luna',
          especie: 'perro',
          notas_salud: null,
          foto_clave: 'mascotas/abc.webp',
          telefono: null,
          telefono_consentido_at: null,
        },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    expect(result).toEqual({
      success: true,
      data: { nombre: 'Luna', especie: 'perro', notas: null, fotoUrl: 'https://cdn.example.com/mascotas/abc.webp', telefono: null },
    });
  });

  it('con foto_clave pero SIN NEXT_PUBLIC_R2_DOMAIN configurado, fotoUrl queda en null (nunca lanza)', async () => {
    const fake = crearClienteFake({
      pet_chapas: {
        data: {
          nombre: 'Luna',
          especie: 'perro',
          notas_salud: null,
          foto_clave: 'mascotas/abc.webp',
          telefono: null,
          telefono_consentido_at: null,
        },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    expect(result).toEqual({
      success: true,
      data: { nombre: 'Luna', especie: 'perro', notas: null, fotoUrl: null, telefono: null },
    });
  });

  it('un error de Postgres se traduce a DB_ERROR, nunca lanza', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: null, error: { message: 'timeout' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findPerfilActivo(EMPRESA_ID, CODIGO);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
  });
});

const TOKEN = 'a'.repeat(43);
const LIMITE = '2026-11-16T12:00:00.000Z';

describe('SupabasePetChapaPerfilRepository.reservarAlta', () => {
  function input(overrides: Record<string, unknown> = {}) {
    return {
      codigo: CODIGO,
      email: 'ana@ejemplo.com',
      nombre: 'Luna',
      especie: 'perro' as const,
      notas: null,
      idioma: 'es' as const,
      version: 'pet-perfil-v1',
      token: TOKEN,
      ahora: '2026-11-18T12:00:00.000Z',
      pendienteCaducaAntesDe: LIMITE,
      ...overrides,
    };
  }

  it('hace un update con email, nombre, especie, notas_salud, idioma, gestion_token, consiente_perfil_at, texto_consentimiento_version y confirmado_at: null', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [{ codigo: CODIGO }], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].payload).toEqual({
      email: 'ana@ejemplo.com',
      nombre: 'Luna',
      especie: 'perro',
      notas_salud: null,
      idioma: 'es',
      gestion_token: TOKEN,
      consiente_perfil_at: '2026-11-18T12:00:00.000Z',
      texto_consentimiento_version: 'pet-perfil-v1',
      confirmado_at: null,
    });
  });

  it('filtra por empresa_id y codigo', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [{ codigo: CODIGO }], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].filtros).toEqual({ empresa_id: EMPRESA_ID, codigo: CODIGO });
  });

  it('el or() es exactamente email.is.null,and(confirmado_at.is.null,consiente_perfil_at.lt."<ISO>") con el ISO entre comillas', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [{ codigo: CODIGO }], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].or).toBe(
      `email.is.null,and(confirmado_at.is.null,consiente_perfil_at.lt."${LIMITE}")`,
    );
  });

  it('select("codigo") con 1 fila devuelve true', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [{ codigo: CODIGO }], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.reservarAlta(EMPRESA_ID, input());

    expect(fake.llamadas[0].select).toBe('codigo');
    expect(result).toEqual({ success: true, data: true });
  });

  it('con 0 filas devuelve false', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: [], error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.reservarAlta(EMPRESA_ID, input());

    expect(result).toEqual({ success: true, data: false });
  });

  it('un error de Supabase devuelve success:false sin filtrar el código, el email ni el token', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: null, error: { message: 'conexión perdida' } },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.reservarAlta(EMPRESA_ID, input());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).not.toContain('ana@ejemplo.com');
      expect(result.error.message).not.toContain(TOKEN);
    }
  });
});

describe('SupabasePetChapaPerfilRepository.findContacto', () => {
  it('selecciona exactamente "email, idioma, nombre, gestion_token, confirmado_at", nunca *', async () => {
    const fake = crearClienteFake({
      pet_chapas: {
        data: { email: 'ana@ejemplo.com', idioma: 'es', nombre: 'Luna', gestion_token: TOKEN, confirmado_at: null },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    await repo.findContacto(EMPRESA_ID, CODIGO);

    expect(fake.llamadas[0].select).toBe('email, idioma, nombre, gestion_token, confirmado_at');
    expect(fake.llamadas[0].select).not.toContain('*');
  });

  it('con email y confirmado_at null, devuelve estado pendiente', async () => {
    const fake = crearClienteFake({
      pet_chapas: {
        data: { email: 'ana@ejemplo.com', idioma: 'es', nombre: 'Luna', gestion_token: TOKEN, confirmado_at: null },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findContacto(EMPRESA_ID, CODIGO);

    expect(result).toEqual({
      success: true,
      data: { estado: 'pendiente', email: 'ana@ejemplo.com', idioma: 'es', nombre: 'Luna', token: TOKEN },
    });
  });

  it('con confirmado_at, devuelve estado activa', async () => {
    const fake = crearClienteFake({
      pet_chapas: {
        data: {
          email: 'ana@ejemplo.com',
          idioma: 'en',
          nombre: 'Rex',
          gestion_token: TOKEN,
          confirmado_at: '2026-11-01T00:00:00.000Z',
        },
        error: null,
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findContacto(EMPRESA_ID, CODIGO);

    expect(result).toEqual({
      success: true,
      data: { estado: 'activa', email: 'ana@ejemplo.com', idioma: 'en', nombre: 'Rex', token: TOKEN },
    });
  });

  it('sin email (chapa libre o inexistente), devuelve data: null', async () => {
    const fake = crearClienteFake({
      pet_chapas: { data: { email: null, idioma: null, nombre: null, gestion_token: null, confirmado_at: null }, error: null },
    });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findContacto(EMPRESA_ID, CODIGO);

    expect(result).toEqual({ success: true, data: null });
  });

  it('sin fila, devuelve data: null', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: null } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findContacto(EMPRESA_ID, CODIGO);

    expect(result).toEqual({ success: true, data: null });
  });

  it('un error de Postgres se traduce a DB_ERROR, nunca lanza', async () => {
    const fake = crearClienteFake({ pet_chapas: { data: null, error: { message: 'timeout' } } });
    getSupabaseClientMock.mockReturnValue(fake);
    const repo = new SupabasePetChapaPerfilRepository();

    const result = await repo.findContacto(EMPRESA_ID, CODIGO);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DB_ERROR');
  });
});
