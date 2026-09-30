import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { LegalSettingsForm } from '@/components/admin/legal/LegalSettingsForm';
import { EMPRESA_LEGAL_POR_DEFECTO } from '@/core/domain/entities/empresa-legal';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({ fetchWithCsrf: (...a: unknown[]) => fetchWithCsrf(...a) }));

const titular = { nombre: 'Demo S.L.', nif: 'B1', direccion: 'Calle 1', email: 'a@b.test', telefono: null, registroMercantil: null };

function montar(tipo: 'tienda' | 'restaurante', envio = false) {
  return render(
    <LanguageProvider>
      <LegalSettingsForm inicial={EMPRESA_LEGAL_POR_DEFECTO} titular={titular}
        flags={{ tipo, deliveryHabilitado: false, envioDomicilioHabilitado: envio }} />
    </LanguageProvider>
  );
}

beforeEach(() => fetchWithCsrf.mockReset());

describe('LegalSettingsForm', () => {
  it('restaurante: solo pestañas de aviso legal y condiciones', () => {
    montar('restaurante');
    expect(screen.getByRole('tab', { name: 'Aviso legal' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Condiciones' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Envíos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Devoluciones' })).not.toBeInTheDocument();
  });

  it('tienda con envío: las cuatro pestañas', () => {
    montar('tienda', true);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('muestra los datos de empresa en solo lectura', () => {
    montar('tienda');
    expect(screen.getByText('Demo S.L.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Demo S.L.')).not.toBeInTheDocument();
  });

  it('no envía si el plazo de desistimiento baja de 14', async () => {
    montar('tienda');
    fireEvent.click(screen.getByRole('tab', { name: 'Devoluciones' }));
    fireEvent.change(screen.getByLabelText('Plazo de desistimiento (días)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/14 días/);
    expect(fetchWithCsrf).not.toHaveBeenCalled();
  });

  it('guarda con PUT a /api/admin/legal', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true, json: async () => ({ data: EMPRESA_LEGAL_POR_DEFECTO }) });
    montar('tienda');
    fireEvent.change(screen.getByLabelText('Registro Mercantil'), { target: { value: 'RM TF tomo 1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/legal');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string).registroMercantil).toBe('RM TF tomo 1');
  });

  it('garantía de producto nuevo muestra 36 meses fijos', () => {
    montar('tienda');
    fireEvent.click(screen.getByRole('tab', { name: 'Devoluciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Añadir garantía' }));
    expect(screen.getByLabelText('Garantía legal (meses)')).toBeDisabled();
    expect(screen.getByLabelText('Garantía legal (meses)')).toHaveValue(36);
  });
});
