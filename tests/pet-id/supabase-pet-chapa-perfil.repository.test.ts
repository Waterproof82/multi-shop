/**
 * sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias),
 * Fase 9 (design.md DD1/R-QR.3/R-QR.6/R-QR.7): `findPerfilActivo` siempre
 * filtra por `empresa_id` y `confirmado_at IS NOT NULL`, nunca selecciona
 * `*`, nunca selecciona `email` ni `gestion_token`, y solo expone el
 * teléfono cuando `telefono_consentido_at` está marcado. Calco del patrón
 * de `supabase-pet-chapa-admin.repository.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface LlamadaFake {
  tabla: string;
  select?: string;
  filtros: Record<string, unknown>;
  noNulos: Record<string, boolean>;
}

interface RespuestaFake {
  data: unknown;
  error: { message: string; code?: string } | null;
}

function crearClienteFake(respuestasPorTabla: Record<string, RespuestaFake>) {
  const llamadas: LlamadaFake[] = [];

  function from(tabla: string) {
    const registro: LlamadaFake = { tabla, filtros: {}, noNulos: {} };
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
      not(col: string, _op: string, val: unknown) {
        if (val === null) registro.noNulos[col] = true;
        return builder;
      },
      async maybeSingle() {
        const r = respuesta();
        return { data: r.data, error: r.error };
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
