/**
 * `flagModuloHabilitado(empresaId, columna)` — generalización de
 * `kits-habilitado.ts` (DD11 de design.md) para cualquier columna booleana de
 * `empresas` que el superadmin active por tenant (hoy `kits_caducidad_habilitado`
 * y `pet_id_qr_habilitado`).
 *
 * Mismo contrato que el original: cachea 60 s por (columna, empresa); ante un
 * error de BD CIERRA (lanza) y no cachea el fallo, porque estas secciones
 * exponen datos personales y nadie depende de que sigan abiertas en caliente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearFakeSupabase } from '../helpers/fake-supabase';

const getSupabaseClientMock = vi.fn();
vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: (...a: unknown[]) => getSupabaseClientMock(...(a as [])),
}));

const { flagModuloHabilitado } = await import('@/lib/empresa/flag-modulo');

beforeEach(() => {
  getSupabaseClientMock.mockReset();
});

describe('flagModuloHabilitado', () => {
  it('devuelve true si la columna pedida está activa para la empresa', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { pet_id_qr_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    expect(await flagModuloHabilitado('empresa-1', 'pet_id_qr_habilitado')).toBe(true);
  });

  it('devuelve false si el flag está inactivo o la empresa no existe', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: null, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    expect(await flagModuloHabilitado('empresa-2', 'pet_id_qr_habilitado')).toBe(false);
  });

  it('consulta la empresa OBJETIVO pasada, no una empresa distinta ni un flag global', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { pet_id_qr_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    await flagModuloHabilitado('empresa-objetivo-del-superadmin', 'pet_id_qr_habilitado');

    expect(fake.llamadas[0].tabla).toBe('empresas');
    expect(fake.llamadas[0].filtros).toEqual({ id: 'empresa-objetivo-del-superadmin' });
  });

  it('cachea 60s por (columna, empresa): una segunda llamada no vuelve a consultar la BD', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { pet_id_qr_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    await flagModuloHabilitado('empresa-3', 'pet_id_qr_habilitado');
    await flagModuloHabilitado('empresa-3', 'pet_id_qr_habilitado');

    expect(getSupabaseClientMock).toHaveBeenCalledTimes(1);
  });

  it('dos columnas distintas de la misma empresa NO comparten caché', async () => {
    const fake = crearFakeSupabase({
      tablas: {
        'empresas.select': [
          { data: { kits_caducidad_habilitado: true }, error: null },
          { data: { pet_id_qr_habilitado: false }, error: null },
        ],
      },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    expect(await flagModuloHabilitado('empresa-multi-flag', 'kits_caducidad_habilitado')).toBe(true);
    expect(await flagModuloHabilitado('empresa-multi-flag', 'pet_id_qr_habilitado')).toBe(false);
    expect(getSupabaseClientMock).toHaveBeenCalledTimes(2);
  });

  it('ante un error de BD, CIERRA (lanza) en vez de dejar pasar, y no cachea el fallo', async () => {
    const fakeError = crearFakeSupabase({
      tablas: { 'empresas.select': { data: null, error: { message: 'conexión perdida' } } },
    });
    getSupabaseClientMock.mockReturnValue(fakeError);

    await expect(flagModuloHabilitado('empresa-4', 'pet_id_qr_habilitado')).rejects.toThrow();

    const fakeOk = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { pet_id_qr_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fakeOk);

    expect(await flagModuloHabilitado('empresa-4', 'pet_id_qr_habilitado')).toBe(true);
  });
});
