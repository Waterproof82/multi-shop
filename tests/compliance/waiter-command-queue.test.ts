/**
 * Cola de comandos offline del panel de camarero — política de retención.
 *
 * Cubre la regla con consecuencias operativas reales: qué comandos se descartan
 * y cuáles sobreviven a un fallo. Equivocarse en cualquiera de los dos lados
 * tiene coste:
 *   - descartar de más → el cocinero marcó un plato y el cambio se perdió
 *   - conservar de más → la cola se atasca con un comando que nunca podrá
 *     aplicarse, y reintenta para siempre
 *
 * Se testean funciones puras porque el resto del módulo depende de IndexedDB,
 * que no existe en el entorno de test de node.
 */
import { describe, it, expect } from 'vitest';
import {
  shouldDropAfterResponse,
  isExpired,
  itemStatusKey,
} from '../../src/lib/waiter/command-queue';

describe('shouldDropAfterResponse — qué sale de la cola', () => {
  it('descarta ante 2xx: el cambio se aplicó', () => {
    expect(shouldDropAfterResponse(200)).toBe(true);
    expect(shouldDropAfterResponse(204)).toBe(true);
  });

  it('descarta ante 4xx: reintentarlo daría siempre el mismo error', () => {
    // Ítem inexistente, estado inválido o pedido ya cerrado. Conservarlo
    // atascaría la cola indefinidamente.
    expect(shouldDropAfterResponse(400)).toBe(true);
    expect(shouldDropAfterResponse(403)).toBe(true);
    expect(shouldDropAfterResponse(404)).toBe(true);
    expect(shouldDropAfterResponse(409)).toBe(true);
  });

  it('CONSERVA ante 5xx: el fallo es del servidor y puede ser transitorio', () => {
    expect(shouldDropAfterResponse(500)).toBe(false);
    expect(shouldDropAfterResponse(502)).toBe(false);
    expect(shouldDropAfterResponse(503)).toBe(false);
  });

  it('conserva ante 429: rate limit es transitorio por definición', () => {
    // 429 cae fuera del rango 4xx que se descarta a propósito: reintentar
    // más tarde es exactamente la respuesta correcta a un rate limit.
    expect(shouldDropAfterResponse(429)).toBe(false);
  });
});

describe('isExpired — comandos demasiado viejos', () => {
  const HORA = 60 * 60 * 1000;

  it('conserva un comando reciente', () => {
    const now = 1_000_000_000;
    expect(isExpired(now - 60_000, now)).toBe(false);
  });

  it('descarta pasada la hora: reproducirlo contradiría el servicio ya ocurrido', () => {
    const now = 1_000_000_000;
    expect(isExpired(now - HORA - 1, now)).toBe(true);
  });

  it('el límite exacto todavía no expira', () => {
    const now = 1_000_000_000;
    expect(isExpired(now - HORA, now)).toBe(false);
  });
});

describe('itemStatusKey — colapsado por destino', () => {
  it('el mismo ítem produce la misma key, así que un cambio reemplaza al anterior', () => {
    // Es lo que garantiza que solo se envíe el ÚLTIMO estado y que reproducir
    // la cola no pueda dejar el ítem en un estado intermedio equivocado.
    expect(itemStatusKey('ped-1', 0)).toBe(itemStatusKey('ped-1', 0));
  });

  it('ítems distintos del mismo pedido no se pisan entre sí', () => {
    expect(itemStatusKey('ped-1', 0)).not.toBe(itemStatusKey('ped-1', 1));
  });

  it('pedidos distintos no colisionan', () => {
    expect(itemStatusKey('ped-1', 0)).not.toBe(itemStatusKey('ped-2', 0));
  });
});
