import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { TranslatableField } from '@/components/admin/landing/translatable-field';

describe('TranslatableField', () => {
  it('muestra el input en español siempre visible', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola' }} onChange={() => {}} />
      </LanguageProvider>
    );
    expect(screen.getByDisplayValue('Hola')).toBeInTheDocument();
  });

  it('no muestra los otros idiomas hasta hacer click en el toggle', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola', en: 'Hello' }} onChange={() => {}} />
      </LanguageProvider>
    );
    expect(screen.queryByDisplayValue('Hello')).not.toBeInTheDocument();
  });

  it('muestra los otros idiomas al hacer click en el toggle', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola', en: 'Hello' }} onChange={() => {}} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Traducciones/ }));
    expect(screen.getByDisplayValue('Hello')).toBeInTheDocument();
  });

  it('llama a onChange con el campo es actualizado, preservando el resto', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola', en: 'Hello' }} onChange={onChange} />
      </LanguageProvider>
    );
    fireEvent.change(screen.getByDisplayValue('Hola'), { target: { value: 'Hola mundo' } });
    expect(onChange).toHaveBeenCalledWith({ es: 'Hola mundo', en: 'Hello' });
  });

  it('llama a onChange con el campo en actualizado, preservando es', () => {
    const onChange = vi.fn();
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={{ es: 'Hola' }} onChange={onChange} />
      </LanguageProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /Traducciones/ }));
    fireEvent.change(screen.getByLabelText('English'), { target: { value: 'Hello' } });
    expect(onChange).toHaveBeenCalledWith({ es: 'Hola', en: 'Hello' });
  });

  it('renderiza textarea cuando multiline es true', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Descripción" value={{ es: 'Texto largo' }} onChange={() => {}} multiline />
      </LanguageProvider>
    );
    expect(screen.getByDisplayValue('Texto largo').tagName).toBe('TEXTAREA');
  });

  it('funciona con value undefined (sección todavía sin contenido)', () => {
    render(
      <LanguageProvider>
        <TranslatableField label="Título" value={undefined} onChange={() => {}} />
      </LanguageProvider>
    );
    expect(screen.getByLabelText('Título')).toHaveValue('');
  });
});
