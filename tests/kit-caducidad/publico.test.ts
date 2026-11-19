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

// sdd kit-expiry-m3 (docs/sdd/kit-expiry-reminders/m3/), M3i/R-M3.8.1:
// mientras no existía el cron de M3, el alta de avisos no podía prometer
// nada — la bandera estuvo en `false` durante M2b y M3a-M3h. El último
// commit de M3 (M3i, tras la prueba en *preview* del prerrequisito 4 de
// tasks.md) la pone a `true`, en este mismo commit.
describe('KIT_AVISOS_ALTA_LIVE', () => {
  it('es true: M3 (el cron de avisos) ya existe y se probó en preview', () => {
    expect(KIT_AVISOS_ALTA_LIVE).toBe(true);
  });
});
