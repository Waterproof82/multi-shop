import { describe, it, expect } from 'vitest';
import { emojiDeIcono, ICONOS_MODALIDAD_ENTREGA } from '@/lib/modalidad-entrega-iconos';

describe('emojiDeIcono', () => {
  it('devuelve el emoji correspondiente a una clave conocida', () => {
    expect(emojiDeIcono('store')).toBe('🏪');
    expect(emojiDeIcono('bike')).toBe('🚲');
    expect(emojiDeIcono('package')).toBe('📦');
  });

  it('devuelve cadena vacía para una clave desconocida, no undefined', () => {
    expect(emojiDeIcono('algo-que-no-existe')).toBe('');
  });
});

describe('ICONOS_MODALIDAD_ENTREGA', () => {
  it('tiene 5 iconos disponibles, cada uno con value/emoji/labelKey', () => {
    expect(ICONOS_MODALIDAD_ENTREGA).toHaveLength(5);
    for (const icono of ICONOS_MODALIDAD_ENTREGA) {
      expect(icono.value).toBeTruthy();
      expect(icono.emoji).toBeTruthy();
      expect(icono.labelKey).toBeTruthy();
    }
  });
});
