import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LandingSwitches } from '@/app/superadmin/landing-switches';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

function renderSwitches(initialChecked = false) {
  return render(<LandingSwitches empresaId="empresa-1" empresaNombre="La Mermelada" initialChecked={initialChecked} />);
}

describe('LandingSwitches', () => {
  beforeEach(() => {
    fetchWithCsrf.mockReset();
  });

  it('muestra un único switch para "Página de Inicio"', () => {
    renderSwitches();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.getByText('Página de Inicio')).toBeInTheDocument();
  });

  it('se renderiza con estado desactivado por defecto', () => {
    renderSwitches(false);
    expect(screen.getByRole('switch', { name: 'Página de Inicio de La Mermelada' })).toHaveAttribute('aria-checked', 'false');
  });

  it('se renderiza con estado activado cuando initialChecked es true', () => {
    renderSwitches(true);
    expect(screen.getByRole('switch', { name: 'Página de Inicio de La Mermelada' })).toHaveAttribute('aria-checked', 'true');
  });

  it('al togglear manda PATCH con { landing_habilitada } a /api/admin/empresas/{empresaId}', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true });
    renderSwitches(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Página de Inicio de La Mermelada' }));

    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/empresas/empresa-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ landing_habilitada: true });
    expect(screen.getByRole('switch', { name: 'Página de Inicio de La Mermelada' })).toHaveAttribute('aria-checked', 'true');
  });

  it('revierte el switch si el servidor rechaza el cambio', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false });
    renderSwitches(true);
    const switchEl = screen.getByRole('switch', { name: 'Página de Inicio de La Mermelada' });
    fireEvent.click(switchEl);

    await waitFor(() => expect(switchEl).toHaveAttribute('aria-checked', 'true'));
    expect(fetchWithCsrf).toHaveBeenCalledTimes(1);
  });

  it('revierte el switch si falla la red', async () => {
    fetchWithCsrf.mockRejectedValue(new Error('offline'));
    renderSwitches(false);
    const switchEl = screen.getByRole('switch', { name: 'Página de Inicio de La Mermelada' });
    fireEvent.click(switchEl);

    await waitFor(() => expect(switchEl).not.toBeDisabled());
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
  });
});
