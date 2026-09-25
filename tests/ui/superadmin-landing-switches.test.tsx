import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LandingSwitches } from '@/app/superadmin/landing-switches';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

function renderSwitches(activas: Parameters<typeof LandingSwitches>[0]['activas'] = []) {
  return render(<LandingSwitches empresaId="empresa-1" empresaNombre="La Mermelada" activas={activas} />);
}

describe('LandingSwitches', () => {
  beforeEach(() => {
    fetchWithCsrf.mockReset();
  });

  it('muestra un switch por cada uno de los 6 tipos de sección', () => {
    renderSwitches();
    expect(screen.getAllByRole('switch')).toHaveLength(6);
  });

  it('marca como activos solo los tipos recibidos', () => {
    renderSwitches(['hero', 'galeria']);
    expect(screen.getByRole('switch', { name: 'Sección Hero de La Mermelada' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Sección Galería de La Mermelada' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Sección Nosotros de La Mermelada' })).toHaveAttribute('aria-checked', 'false');
  });

  it('al togglear manda PATCH con solo { activo } a la ruta de la sección, con el empresaId del tenant', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: true });
    renderSwitches();
    fireEvent.click(screen.getByRole('switch', { name: 'Sección Nosotros de La Mermelada' }));

    await waitFor(() => expect(fetchWithCsrf).toHaveBeenCalledTimes(1));
    const [url, init] = fetchWithCsrf.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/landing-secciones/nosotros?empresaId=empresa-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ activo: true });
    expect(screen.getByRole('switch', { name: 'Sección Nosotros de La Mermelada' })).toHaveAttribute('aria-checked', 'true');
  });

  it('revierte el switch si el servidor rechaza el cambio', async () => {
    fetchWithCsrf.mockResolvedValue({ ok: false });
    renderSwitches(['hero']);
    const hero = screen.getByRole('switch', { name: 'Sección Hero de La Mermelada' });
    fireEvent.click(hero);

    await waitFor(() => expect(hero).toHaveAttribute('aria-checked', 'true'));
    expect(fetchWithCsrf).toHaveBeenCalledTimes(1);
  });

  it('revierte el switch si falla la red', async () => {
    fetchWithCsrf.mockRejectedValue(new Error('offline'));
    renderSwitches();
    const cta = screen.getByRole('switch', { name: 'Sección Carta de La Mermelada' });
    fireEvent.click(cta);

    await waitFor(() => expect(cta).not.toBeDisabled());
    expect(cta).toHaveAttribute('aria-checked', 'false');
  });
});
