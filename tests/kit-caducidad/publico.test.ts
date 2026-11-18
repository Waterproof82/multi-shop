import { describe, expect, it } from 'vitest';
import { KIT_AVISOS_ALTA_LIVE, KIT_ESTADO_PUBLICO_LIVE } from '@/lib/kit-caducidad/publico';

// sdd kit-expiry-m5 R-M5.4.3 / kit-expiry-m2a R-M2a.4.1: mientras M2 (estado
// público del kit) no estaba publicado, esta bandera permanecía en `false`
// y las etiquetas PDF llevaban la marca de muestra. El PR que cierra M2
// (kit-expiry-m2a, M2a4) la pone a `true` en este mismo commit.

describe('KIT_ESTADO_PUBLICO_LIVE', () => {
  it('es true: M2 ya publica el estado público del kit en /kit/{serie}', () => {
    expect(KIT_ESTADO_PUBLICO_LIVE).toBe(true);
  });
});

// sdd kit-expiry-m2b (docs/sdd/kit-expiry-reminders/m2b/), D-M2b-8/R-M2b.8.1:
// mientras no exista el cron de M3, el alta de avisos no puede prometer
// nada — la bandera sigue en `false` durante todo M2b. La pone a `true` el
// último commit de M3, junto con su propio test.
describe('KIT_AVISOS_ALTA_LIVE', () => {
  it('es false: M3 (el cron de avisos) todavía no existe', () => {
    expect(KIT_AVISOS_ALTA_LIVE).toBe(false);
  });
});
