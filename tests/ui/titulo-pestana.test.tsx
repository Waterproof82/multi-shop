import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LanguageProvider, useLanguage } from '@/lib/language-context';
import { TituloPestana } from '@/components/titulo-pestana';

// El <title> lo pone el servidor, que solo ve `?lang=`; el selector de idioma
// vive en localStorage. Sin sincronizar, elegir ingles dejaba la pestana en
// espanol (y al reves: "Our Catalog" con la UI en espanol, 2026-09-29).

function CambiarIdioma() {
  const { setLanguage } = useLanguage();
  return (
    <button type="button" onClick={() => setLanguage('fr')}>
      fr
    </button>
  );
}

function renderTitulo() {
  return render(
    <LanguageProvider>
      <TituloPestana k="nuestraCarta" nombre="Alma de Arena" />
      <CambiarIdioma />
    </LanguageProvider>
  );
}

describe('TituloPestana', () => {
  beforeEach(() => {
    localStorage.clear();
    document.title = 'Nuestro Catálogo | Alma de Arena';
  });

  it('sin preferencia guardada, la pestana queda en espanol', () => {
    renderTitulo();
    expect(document.title).toBe('Nuestro Catálogo | Alma de Arena');
  });

  it('sigue el idioma guardado en el selector', () => {
    localStorage.setItem('preferred-language', 'en');
    renderTitulo();
    expect(document.title).toBe('Our Catalog | Alma de Arena');
  });

  it('se actualiza al cambiar de idioma sin recargar', () => {
    renderTitulo();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    expect(document.title).toBe('Notre catalogue | Alma de Arena');
  });
});
