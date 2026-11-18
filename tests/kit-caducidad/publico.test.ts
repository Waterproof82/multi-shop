import { describe, expect, it } from 'vitest';
import { KIT_ESTADO_PUBLICO_LIVE } from '@/lib/kit-caducidad/publico';

// sdd kit-expiry-m5 R-M5.4.3 / kit-expiry-m2a R-M2a.4.1: mientras M2 (estado
// público del kit) no estaba publicado, esta bandera permanecía en `false`
// y las etiquetas PDF llevaban la marca de muestra. El PR que cierra M2
// (kit-expiry-m2a, M2a4) la pone a `true` en este mismo commit.

describe('KIT_ESTADO_PUBLICO_LIVE', () => {
  it('es true: M2 ya publica el estado público del kit en /kit/{serie}', () => {
    expect(KIT_ESTADO_PUBLICO_LIVE).toBe(true);
  });
});
