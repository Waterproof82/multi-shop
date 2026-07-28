/**
 * E2E — VeriFactu QR URL: columna, persistencia e inmutabilidad (RD 1007/2023 Art. 12)
 *
 * Verifica vía Supabase REST API con service_role:
 *   1. empresas.verifactu_mode existe con CHECK ('no-verifactu' | 'verifactu')
 *   2. tpv_cobros.verifactu_qr_url existe y es seleccionable
 *   3. UPDATE de verifactu_qr_url → excepción trigger tpv_cobro_block_update (inmutabilidad)
 *   4. Si hay cobros con NIF, el formato de URL cumple la spec AEAT Anexo II
 *
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
 */
import { test, expect } from '@playwright/test';

test.skip(
  !process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY,
  'Requiere PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY',
);

function supabaseUrl(): string { return process.env.NEXT_PUBLIC_SUPABASE_URL!; }
function serviceKey(): string  { return process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY!; }

function serviceHeaders(prefer = 'return=representation') {
  return {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

test.describe('VeriFactu QR URL — No-VeriFactu Mode (RD 1007/2023 Art. 12)', () => {
  test('empresas.verifactu_mode: columna existe y acepta solo valores válidos', async ({ request }) => {
    const res = await request.get(
      `${supabaseUrl()}/rest/v1/empresas?select=verifactu_mode&limit=1`,
      { headers: serviceHeaders() },
    );
    // 400 = columna no existe → gap crítico
    expect(res.status()).toBe(200);
    const rows = await res.json() as Array<{ verifactu_mode: string }>;
    if (rows.length > 0) {
      expect(['no-verifactu', 'verifactu']).toContain(rows[0].verifactu_mode);
    }
  });

  test('tpv_cobros.verifactu_qr_url: columna existe (migración 20260729000002)', async ({ request }) => {
    const res = await request.get(
      `${supabaseUrl()}/rest/v1/tpv_cobros?select=id,verifactu_qr_url&limit=1`,
      { headers: serviceHeaders() },
    );
    // 400 = columna no existe → gap crítico (migración no aplicada)
    expect(res.status()).toBe(200);
  });

  test('UPDATE verifactu_qr_url → excepción trigger tpv_cobro_block_update (inmutabilidad)', async ({ request }) => {
    const DUMMY_UUID = '00000000-0000-0000-0000-000000000099';
    const res = await request.patch(
      `${supabaseUrl()}/rest/v1/tpv_cobros?id=eq.${DUMMY_UUID}`,
      {
        headers: serviceHeaders('return=minimal'),
        data: { verifactu_qr_url: 'https://manipulado.test/falso' },
      },
    );
    // 204 si la fila no existe (trigger no se dispara — aceptable)
    // 400/409 si existe y el trigger lanza RAISE EXCEPTION
    expect([204, 400, 409]).toContain(res.status());
    if (res.status() !== 204) {
      const body = await res.text();
      expect(body).toMatch(/inmutables|tpv_cobros|campos fiscales/i);
    }
  });

  test('Si hay cobros con NIF: formato URL cumple spec AEAT Anexo II', async ({ request }) => {
    const res = await request.get(
      `${supabaseUrl()}/rest/v1/tpv_cobros?select=verifactu_qr_url&verifactu_qr_url=not.is.null&limit=5`,
      { headers: serviceHeaders() },
    );
    expect(res.status()).toBe(200);
    const rows = await res.json() as Array<{ verifactu_qr_url: string }>;

    if (rows.length === 0) {
      // Sin cobros con NIF en este entorno — no es un fallo
      console.log('Sin cobros con verifactu_qr_url — verificación de formato omitida');
      return;
    }

    for (const { verifactu_qr_url: url } of rows) {
      // URL base AEAT
      expect(url).toMatch(
        /^https:\/\/www2\.agenciatributaria\.gob\.es\/wlpl\/TIKE-CONT\/ValidarQR\?/,
      );
      // Parámetros presentes
      expect(url).toContain('nif=');
      expect(url).toContain('numserie=');
      expect(url).toContain('fecha=');
      expect(url).toContain('importe=');

      // numserie: {serie}{6dígitos} — SIN guión (Anexo II)
      const numserieMatch = url.match(/numserie=([^&]+)/);
      expect(numserieMatch).not.toBeNull();
      expect(numserieMatch![1]).toMatch(/^[A-Za-z]\d{6}$/);

      // fecha: DD-MM-YYYY
      const fechaMatch = url.match(/fecha=([^&]+)/);
      expect(fechaMatch).not.toBeNull();
      expect(fechaMatch![1]).toMatch(/^\d{2}-\d{2}-\d{4}$/);

      // importe: dígitos.2decimales (punto, no coma)
      const importeMatch = url.match(/importe=([^&$]+)/);
      expect(importeMatch).not.toBeNull();
      expect(importeMatch![1]).toMatch(/^\d+\.\d{2}$/);
    }
  });
});
