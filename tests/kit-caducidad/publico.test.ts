import { describe, expect, it } from 'vitest';
import { KIT_ESTADO_PUBLICO_LIVE } from '@/lib/kit-caducidad/publico';

// sdd kit-expiry-m5 R-M5.4.3: mientras M2 (estado público del kit) no esté
// publicado, esta bandera permanece en `false` y las etiquetas PDF llevan
// la marca de muestra. El PR que cierre M2 la pone a `true` y actualiza
// esta misma aserción en el mismo commit.

describe('KIT_ESTADO_PUBLICO_LIVE', () => {
  it('es false hasta que M2 publique el estado público del kit', () => {
    expect(KIT_ESTADO_PUBLICO_LIVE).toBe(false);
  });
});
