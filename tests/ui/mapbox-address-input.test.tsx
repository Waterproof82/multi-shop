import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { MapboxAddressInput } from '@/components/MapboxAddressInput';

describe('MapboxAddressInput', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          place_name: 'Calle Falsa 123, Madrid',
          geometry: { coordinates: [-3.7, 40.4] },
          context: [{ id: 'postcode.123', text: '28001' }],
        }],
      }),
    }));
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('muestra sugerencias tras escribir 3+ caracteres y llama onSelect al elegir una', async () => {
    const onSelect = vi.fn();
    render(
      <LanguageProvider>
        <MapboxAddressInput onSelect={onSelect} />
      </LanguageProvider>
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Calle Falsa' } });
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(0);

    expect(screen.getByText('Calle Falsa 123, Madrid')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('Calle Falsa 123, Madrid'));

    expect(onSelect).toHaveBeenCalledWith({
      address: 'Calle Falsa 123, Madrid',
      latitude: 40.4,
      longitude: -3.7,
      postalCode: '28001',
    });
  });

  it('llama onInputChange en cada tecla, no solo al seleccionar una sugerencia', async () => {
    const onSelect = vi.fn();
    const onInputChange = vi.fn();
    render(
      <LanguageProvider>
        <MapboxAddressInput onSelect={onSelect} onInputChange={onInputChange} />
      </LanguageProvider>
    );

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'C' } });
    expect(onInputChange).toHaveBeenCalledWith('C');

    fireEvent.change(input, { target: { value: 'Ca' } });
    expect(onInputChange).toHaveBeenCalledWith('Ca');

    fireEvent.change(input, { target: { value: 'Calle Falsa' } });
    expect(onInputChange).toHaveBeenCalledWith('Calle Falsa');
    expect(onInputChange).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(0);

    fireEvent.mouseDown(screen.getByText('Calle Falsa 123, Madrid'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    // onInputChange no se llama de nuevo al seleccionar una sugerencia
    expect(onInputChange).toHaveBeenCalledTimes(3);
  });
});
