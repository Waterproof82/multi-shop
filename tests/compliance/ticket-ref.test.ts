/**
 * Las dos formas de escribir la referencia de un ticket NO son intercambiables.
 *
 * POR QUÉ ESTE TEST EXISTE
 * Durante meses el formato estuvo escrito a mano en cuatro sitios, en dos
 * variantes: con guion y sin él. Visto así parece un descuido, y el arreglo
 * "obvio" es unificarlas.
 *
 * Unificarlas rompe la verificación fiscal. La variante SIN guion es el
 * parámetro `numserie` del QR de la AEAT (VeriFactu, RD 1007/2023), y su formato
 * lo dicta Hacienda. El fallo no daría ningún error visible: el ticket se
 * imprimiría igual, el QR se escanearía igual, y la Agencia respondería que esa
 * factura no consta. Se descubre en una inspección, no en un log.
 *
 * Estos tests están para que ese "arreglo" no llegue nunca a producción.
 */
import { describe, it, expect } from 'vitest';
import { refTicketVisible, numserieAeat } from '@/lib/tpv/ticket-ref';

describe('refTicketVisible — para leer y dictar', () => {
  it('lleva guion entre serie y número', () => {
    expect(refTicketVisible('T', 123)).toBe('T-000123');
  });

  it('rellena a 6 dígitos', () => {
    expect(refTicketVisible('T', 1)).toBe('T-000001');
  });

  it('no trunca cuando el número pasa de 6 dígitos', () => {
    // Un restaurante con mucho volumen llega ahí. Truncar cambiaría la
    // referencia de una factura ya emitida.
    expect(refTicketVisible('T', 1234567)).toBe('T-1234567');
  });
});

describe('numserieAeat — para la Agencia Tributaria', () => {
  it('NO lleva guion: el formato lo dicta Hacienda', () => {
    expect(numserieAeat('T', 123)).toBe('T000123');
    expect(numserieAeat('T', 123)).not.toContain('-');
  });

  it('rellena a 6 dígitos igual que la visible', () => {
    expect(numserieAeat('T', 1)).toBe('T000001');
  });

  it('no trunca cuando el número pasa de 6 dígitos', () => {
    expect(numserieAeat('T', 1234567)).toBe('T1234567');
  });
});

describe('las dos formas se diferencian SOLO en el separador', () => {
  it('quitar el guion a la visible da exactamente la de la AEAT', () => {
    // Si esto dejara de cumplirse, una de las dos habría cambiado de forma
    // sin que la otra se enterase.
    for (const [serie, numero] of [['T', 1], ['T', 999999], ['A', 42]] as const) {
      expect(refTicketVisible(serie, numero).replace('-', '')).toBe(
        numserieAeat(serie, numero),
      );
    }
  });
});

describe('la URL de validación de la AEAT', () => {
  /** Réplica de la que construyen `CobroConfirmado` y el ticket impreso. */
  function urlValidacion(nif: string, serie: string, numeroTicket: number): string {
    const params = new URLSearchParams({
      nif,
      numserie: numserieAeat(serie, numeroTicket),
      fecha: '09-08-2026',
      importe: '12.50',
    });
    return `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?${params.toString()}`;
  }

  it('el numserie viaja sin guion', () => {
    const url = new URL(urlValidacion('B12345678', 'T', 123));
    expect(url.searchParams.get('numserie')).toBe('T000123');
  });

  it('apunta al dominio real de la AEAT', () => {
    // Si alguien lo cambia por un dominio de pruebas y se queda, los tickets
    // salen a la calle con un QR que no valida nada.
    const url = new URL(urlValidacion('B12345678', 'T', 1));
    expect(url.hostname).toBe('www2.agenciatributaria.gob.es');
    expect(url.protocol).toBe('https:');
  });
});
