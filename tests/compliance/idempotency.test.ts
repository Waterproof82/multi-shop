/**
 * Idempotencia de creación de pedidos.
 *
 * Lo que estas pruebas protegen no es "que la función devuelva algo": es que
 * dos envíos del MISMO pedido se reconozcan como el mismo, y que dos pedidos
 * distintos NO se confundan. Un fallo en la primera dirección deja duplicados
 * en la cocina; en la segunda, silencia un pedido real haciéndolo pasar por
 * reenvío de otro. Las dos son averías de servicio, no detalles de formato.
 */
import { describe, it, expect } from 'vitest';
import {
  IDEMPOTENCY_HEADER,
  buildIdempotencyKey,
  fingerprintPayload,
  isValidIdempotencyKey,
  readIdempotencyKey,
} from '../../src/lib/idempotency';

const UUID = '3f2a9c1e-7b04-4d55-9e31-8a6c0f2d4b77';

describe('formato de la clave', () => {
  it('acepta un UUID y un UUID namespaciado por pase', () => {
    expect(isValidIdempotencyKey(UUID)).toBe(true);
    expect(isValidIdempotencyKey(`${UUID}:primer`)).toBe(true);
    expect(isValidIdempotencyKey(`${UUID}:postre`)).toBe(true);
  });

  it('rechaza claves cortas, vacías o ausentes', () => {
    // Una clave corta es adivinable, y adivinar una clave ajena es la vía para
    // recibir la respuesta de otro pedido — tracking_token incluido.
    expect(isValidIdempotencyKey('abc')).toBe(false);
    expect(isValidIdempotencyKey('')).toBe(false);
    expect(isValidIdempotencyKey(null)).toBe(false);
    expect(isValidIdempotencyKey(undefined)).toBe(false);
  });

  it('rechaza caracteres fuera del alfabeto permitido', () => {
    expect(isValidIdempotencyKey(`${UUID} con espacio`)).toBe(false);
    expect(isValidIdempotencyKey(`${UUID}/../otra`)).toBe(false);
    expect(isValidIdempotencyKey(`${UUID}'; DROP TABLE`)).toBe(false);
  });

  it('rechaza claves más largas que el máximo', () => {
    expect(isValidIdempotencyKey('a'.repeat(129))).toBe(false);
    expect(isValidIdempotencyKey('a'.repeat(128))).toBe(true);
  });
});

describe('namespacing por pase', () => {
  it('deja la clave intacta cuando no hay pase', () => {
    expect(buildIdempotencyKey(UUID, null)).toBe(UUID);
    expect(buildIdempotencyKey(UUID, undefined)).toBe(UUID);
  });

  it('produce una clave distinta por pase, y todas siguen siendo válidas', () => {
    const primer = buildIdempotencyKey(UUID, 'primer');
    const segundo = buildIdempotencyKey(UUID, 'segundo');

    expect(primer).not.toBe(segundo);
    expect(isValidIdempotencyKey(primer)).toBe(true);
    expect(isValidIdempotencyKey(segundo)).toBe(true);
  });

  it('es estable: el mismo pase siempre da la misma clave', () => {
    // Si no lo fuera, cada reintento estrenaría clave y la idempotencia no
    // serviría para nada — que es exactamente el fallo que hay que evitar.
    expect(buildIdempotencyKey(UUID, 'primer')).toBe(buildIdempotencyKey(UUID, 'primer'));
  });
});

describe('huella del contenido', () => {
  const pedido = {
    tipo: 'mesa',
    mesa_id: '11111111-2222-3333-4444-555555555555',
    idioma: 'es',
    items: [
      { item: { id: 'a', name: 'Croquetas', price: 8.5 }, quantity: 2 },
      { item: { id: 'b', name: 'Caña', price: 2.5 }, quantity: 1 },
    ],
  };

  it('ignora el orden de las claves del objeto', async () => {
    // Dos reintentos pueden serializar las propiedades en distinto orden. Si eso
    // cambiara la huella, el servidor respondería 409 a un pedido idéntico.
    const reordenado = {
      items: pedido.items,
      idioma: pedido.idioma,
      mesa_id: pedido.mesa_id,
      tipo: pedido.tipo,
    };

    expect(await fingerprintPayload(reordenado)).toBe(await fingerprintPayload(pedido));
  });

  it('trata "ausente" y "undefined" como lo mismo', async () => {
    expect(await fingerprintPayload({ ...pedido, nota: undefined })).toBe(
      await fingerprintPayload(pedido),
    );
  });

  it('cambia si cambia una cantidad', async () => {
    const conMasCroquetas = {
      ...pedido,
      items: [{ ...pedido.items[0], quantity: 3 }, pedido.items[1]],
    };

    expect(await fingerprintPayload(conMasCroquetas)).not.toBe(await fingerprintPayload(pedido));
  });

  it('cambia si cambia la mesa', async () => {
    // El caso peligroso: misma clave, mesa distinta. Si la huella no lo detectara,
    // el comensal de la mesa 4 recibiría el tracking_token de la mesa 7.
    const otraMesa = { ...pedido, mesa_id: '99999999-2222-3333-4444-555555555555' };

    expect(await fingerprintPayload(otraMesa)).not.toBe(await fingerprintPayload(pedido));
  });

  it('respeta el orden de los arrays', async () => {
    // En `items` el orden es contenido: la comanda se imprime en ese orden.
    const invertido = { ...pedido, items: [pedido.items[1], pedido.items[0]] };

    expect(await fingerprintPayload(invertido)).not.toBe(await fingerprintPayload(pedido));
  });

  it('distingue un valor numérico de su representación en texto', async () => {
    const comoTexto = {
      ...pedido,
      items: [{ ...pedido.items[0], quantity: '2' }, pedido.items[1]],
    };

    expect(await fingerprintPayload(comoTexto)).not.toBe(await fingerprintPayload(pedido));
  });

  it('devuelve SHA-256 en hexadecimal', async () => {
    expect(await fingerprintPayload(pedido)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('lectura desde la petición', () => {
  const post = (headers: Record<string, string>) =>
    new Request('https://ejemplo.test/api/pedidos', { method: 'POST', headers });

  it('devuelve la clave cuando la cabecera es válida', () => {
    expect(readIdempotencyKey(post({ [IDEMPOTENCY_HEADER]: UUID }))).toBe(UUID);
  });

  it('devuelve null cuando la cabecera falta', () => {
    expect(readIdempotencyKey(post({}))).toBeNull();
  });

  it('devuelve null cuando la cabecera no cumple el formato', () => {
    // Degradar a "sin idempotencia" es lo correcto: el pedido se crea igual.
    // Rechazar la petición dejaría al comensal sin comer por una cabecera mal
    // formada, que es un precio absurdo por un metadato de transporte.
    expect(readIdempotencyKey(post({ [IDEMPOTENCY_HEADER]: 'corta' }))).toBeNull();
  });
});
