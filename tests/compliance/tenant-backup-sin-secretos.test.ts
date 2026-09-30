import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La copia por tenant se guarda en R2 como JSON SIN cifrar. Si incluye las
 * credenciales de `empresas`, cualquiera con acceso al bucket se lleva las
 * claves de pago de todos los tenants. La restauración no las necesita: hace
 * `update({...snapshot.empresa})`, y una columna ausente se conserva tal cual.
 *
 * Es una Edge Function de Deno (sin harness de tests propio), así que se
 * verifica sobre el fuente, como el resto de tests de compliance del repo.
 */
const fuente = readFileSync(join(process.cwd(), 'supabase/functions/tenant-backup/index.ts'), 'utf8');

describe('tenant-backup — la copia no contiene secretos', () => {
  it.each(['redsys_secret_key', 'glovo_private_key', 'waiter_pin_hash'])('excluye %s de la empresa', (columna) => {
    expect(fuente).toMatch(new RegExp(`COLUMNAS_SECRETAS[\\s\\S]*'${columna}'`));
  });

  it('guarda la empresa sin las columnas secretas, nunca la fila cruda', () => {
    expect(fuente).toMatch(/empresa:\s*sinSecretos\(empresa\)/);
  });
});
