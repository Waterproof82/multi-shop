import { describe, it, expect } from 'vitest';
import { hasNosotrosContent, hasDondeEstamosContent } from '@/lib/landing/landing-content';

describe('hasNosotrosContent', () => {
  it('false si descripcion es null', () => {
    expect(hasNosotrosContent(null)).toBe(false);
  });

  it('false si todos los idiomas están vacíos', () => {
    expect(hasNosotrosContent({ es: '', en: null })).toBe(false);
  });

  it('true si hay texto en al menos un idioma', () => {
    expect(hasNosotrosContent({ es: 'Somos una empresa familiar' })).toBe(true);
  });
});

describe('hasDondeEstamosContent', () => {
  it('false sin direccion, telefono ni urlMapa', () => {
    expect(hasDondeEstamosContent({ direccion: null, telefono: null, urlMapa: null })).toBe(false);
  });

  it('true con solo direccion', () => {
    expect(hasDondeEstamosContent({ direccion: 'Calle Falsa 123', telefono: null, urlMapa: null })).toBe(true);
  });

  it('true con solo telefono', () => {
    expect(hasDondeEstamosContent({ direccion: null, telefono: '922000000', urlMapa: null })).toBe(true);
  });

  it('true con solo urlMapa', () => {
    expect(hasDondeEstamosContent({ direccion: null, telefono: null, urlMapa: 'https://maps.google.com/x' })).toBe(true);
  });
});
