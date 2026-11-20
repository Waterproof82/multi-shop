/**
 * not-found.tsx de /m/[codigo] — mensaje neutro único (sdd pet-id-qr-profile,
 * Fase 9, DD4/R-QR.3.2/R-QR.3.3): invita a llevar a la mascota a un
 * veterinario, la Policía Local o una protectora, y enlaza a
 * «¿Es tu chapa? Actívala». NO debe delatar CUÁL de los casos de R-QR.3.2
 * ocurrió (desconocido, libre, pendiente, flag apagado o límite superado).
 *
 * DD4: el código YA está en la URL — `<EnlaceActivar/>` lo lee de
 * `usePathname()` del lado del cliente en vez de recibirlo como prop, así
 * que `not-found.tsx` no toma ningún argumento ligado al estado real de la
 * chapa (su HTML de servidor no cambia según el estado).
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const headersGet = vi.fn((_name: string): string | null => null);
vi.mock('next/headers', () => ({
  headers: async () => ({ get: headersGet }),
}));

const usePathnameMock = vi.fn(() => '/m/M-ABCD-1234-5');
vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

beforeEach(() => {
  headersGet.mockReturnValue(null);
  usePathnameMock.mockReturnValue('/m/M-ABCD-1234-5');
});

describe('MascotaPublicaNotFound', () => {
  it('pinta un heading, una guía para quien encuentra a la mascota y el enlace de activación', async () => {
    const NotFound = (await import('@/app/m/[codigo]/not-found')).default;
    render(await NotFound());

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const enlace = screen.getByRole('link');
    expect(enlace).toHaveAttribute('href', '/m/activar?c=M-ABCD-1234-5');
  });

  it('no delata cuál de los casos ocurrió: nada de "libre", "pendiente", "desactivado" ni "límite"', async () => {
    const NotFound = (await import('@/app/m/[codigo]/not-found')).default;
    const { container } = render(await NotFound());
    const texto = (container.textContent ?? '').toLowerCase();

    expect(texto).not.toContain('libre');
    expect(texto).not.toContain('pendiente');
    expect(texto).not.toContain('desactivad');
    expect(texto).not.toContain('límite');
  });

  it('el enlace de activación construye el código a partir de usePathname(), no de un prop', async () => {
    usePathnameMock.mockReturnValue('/m/M-ZZZZ-9999-1');
    const NotFound = (await import('@/app/m/[codigo]/not-found')).default;
    render(await NotFound());

    expect(screen.getByRole('link')).toHaveAttribute('href', '/m/activar?c=M-ZZZZ-9999-1');
  });

  it('resuelve el idioma por accept-language (francés) sin ningún ?lang= disponible', async () => {
    headersGet.mockImplementation((name: string) => (name === 'accept-language' ? 'fr-FR,fr;q=0.9' : null));
    const NotFound = (await import('@/app/m/[codigo]/not-found')).default;
    render(await NotFound());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/afficher cette chape/i);
  });
});
