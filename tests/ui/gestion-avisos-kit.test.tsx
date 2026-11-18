/**
 * `GestionAvisosKit` (sdd kit-expiry-m2b, M2b8b), R-M2b.3.3/3.4/3.5/3.6:
 * pendiente → confirmar o borrar; registrada → darse de baja; el mismo
 * endpoint de gestión; el mensaje final de la baja es el de R-M2b.3.6;
 * nunca aparece ningún email (el componente no lo recibe).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GestionAvisosKit } from '@/components/kit-publico/gestion-avisos-kit';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, estado: 'registrada' }), { status: 200 })));
});

describe('GestionAvisosKit — pendiente', () => {
  it('muestra el botón de confirmar y el enlace de borrado', () => {
    render(<GestionAvisosKit token="token-valido" serie="KEC-ABCD-1234-5" estado="pendiente" />);

    expect(screen.getByText('KEC-ABCD-1234-5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar mis avisos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /No he sido yo: borra estos datos/i })).toBeInTheDocument();
  });

  it('confirmar envía accion=confirmar al endpoint de gestión', async () => {
    render(<GestionAvisosKit token="token-valido" serie="KEC-ABCD-1234-5" estado="pendiente" />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mis avisos' }));

    expect(fetch).toHaveBeenCalledWith('/api/kit-avisos/gestion', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ token: 'token-valido', accion: 'confirmar' });

    await screen.findByRole('status');
  });

  it('el enlace de borrado envía accion=baja y termina con el mensaje de R-M2b.3.6', async () => {
    render(<GestionAvisosKit token="token-valido" serie="KEC-ABCD-1234-5" estado="pendiente" />);
    fireEvent.click(screen.getByRole('button', { name: /No he sido yo: borra estos datos/i }));

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ token: 'token-valido', accion: 'baja' });

    const mensaje = await screen.findByText(/Listo: no recibirás más avisos y hemos borrado tu email y tu teléfono/i);
    expect(mensaje).toBeInTheDocument();
  });
});

describe('GestionAvisosKit — registrada', () => {
  it('muestra el botón de darse de baja, sin los de pendiente', () => {
    render(<GestionAvisosKit token="token-valido" serie="KEC-ABCD-1234-5" estado="registrada" />);

    expect(screen.getByRole('button', { name: 'Darme de baja y borrar mis datos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar mis avisos' })).not.toBeInTheDocument();
  });

  it('la baja envía accion=baja y termina con el mensaje de R-M2b.3.6', async () => {
    render(<GestionAvisosKit token="token-valido" serie="KEC-ABCD-1234-5" estado="registrada" />);
    fireEvent.click(screen.getByRole('button', { name: 'Darme de baja y borrar mis datos' }));

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ token: 'token-valido', accion: 'baja' });

    const mensaje = await screen.findByText(/Listo: no recibirás más avisos y hemos borrado tu email y tu teléfono/i);
    expect(mensaje).toBeInTheDocument();
  });
});

describe('GestionAvisosKit — nunca muestra un email', () => {
  it('el HTML renderizado no contiene ninguna arroba', () => {
    render(<GestionAvisosKit token="token-valido" serie="KEC-ABCD-1234-5" estado="pendiente" />);
    expect(document.body.textContent).not.toContain('@');
  });
});
