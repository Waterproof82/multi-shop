/**
 * `kitsCaducidadHabilitadoParaEmpresa()` — interruptor por tenant que lee cada
 * ruta de /api/admin/kits/* y el layout del admin (R-M4.1.3/R-M4.1.4).
 *
 * A diferencia de `tpv-habilitado.ts` (que DEJA PASAR si la BD falla, porque
 * ya hay una sesión de pago en curso), aquí un error de BD CIERRA: la sección
 * expone datos personales y nadie depende de que siga abierta en caliente
 * (DD2 de design.md). Por eso el error se lanza y no se cachea.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { crearFakeSupabase } from '../helpers/fake-supabase';

const getSupabaseClientMock = vi.fn();
vi.mock('@/core/infrastructure/database/supabase-client', () => ({
  getSupabaseClient: (...a: unknown[]) => getSupabaseClientMock(...(a as [])),
}));

const { kitsCaducidadHabilitadoParaEmpresa } = await import('@/lib/kit-caducidad/kits-habilitado');

beforeEach(() => {
  getSupabaseClientMock.mockReset();
});

describe('kitsCaducidadHabilitadoParaEmpresa', () => {
  it('devuelve true si la empresa tiene el flag activo', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { kits_caducidad_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    expect(await kitsCaducidadHabilitadoParaEmpresa('empresa-1')).toBe(true);
  });

  it('devuelve false si el flag está inactivo o la empresa no existe', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: null, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    expect(await kitsCaducidadHabilitadoParaEmpresa('empresa-2')).toBe(false);
  });

  it('consulta la empresa OBJETIVO pasada, no una empresa distinta ni un flag global', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { kits_caducidad_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    await kitsCaducidadHabilitadoParaEmpresa('empresa-objetivo-del-superadmin');

    expect(fake.llamadas[0].tabla).toBe('empresas');
    expect(fake.llamadas[0].filtros).toEqual({ id: 'empresa-objetivo-del-superadmin' });
  });

  it('cachea 60s por empresa: una segunda llamada no vuelve a consultar la BD', async () => {
    const fake = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { kits_caducidad_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fake);

    await kitsCaducidadHabilitadoParaEmpresa('empresa-3');
    await kitsCaducidadHabilitadoParaEmpresa('empresa-3');

    expect(getSupabaseClientMock).toHaveBeenCalledTimes(1);
  });

  it('ante un error de BD, CIERRA (lanza) en vez de dejar pasar, y no cachea el fallo', async () => {
    const fakeError = crearFakeSupabase({
      tablas: { 'empresas.select': { data: null, error: { message: 'conexión perdida' } } },
    });
    getSupabaseClientMock.mockReturnValue(fakeError);

    await expect(kitsCaducidadHabilitadoParaEmpresa('empresa-4')).rejects.toThrow();

    const fakeOk = crearFakeSupabase({
      tablas: { 'empresas.select': { data: { kits_caducidad_habilitado: true }, error: null } },
    });
    getSupabaseClientMock.mockReturnValue(fakeOk);

    // El fallo anterior no quedó cacheado: la siguiente llamada vuelve a
    // consultar y obtiene el valor real.
    expect(await kitsCaducidadHabilitadoParaEmpresa('empresa-4')).toBe(true);
  });
});
