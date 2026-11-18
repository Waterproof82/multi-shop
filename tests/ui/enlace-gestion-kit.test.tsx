/**
 * `EnlaceGestionKit` (sdd kit-expiry-m2b, M2b8a), R-M2b.4.1: «¿Ya te
 * registraste?» — pide solo el email y envía a `POST /api/kit-avisos/enlace`.
 * Mismo mensaje neutro que el alta (R-M2b.4.2), nunca el email enviado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnlaceGestionKit } from '@/components/kit-publico/enlace-gestion-kit';

function abrirFormulario() {
  render(<EnlaceGestionKit serie="KEC-ABCD-1234-5" />);
  fireEvent.click(screen.getByRole('button', { name: /Ya te registraste/i }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 })));
});

describe('EnlaceGestionKit', () => {
  it('el botón despliega el formulario, con solo el campo de email', () => {
    render(<EnlaceGestionKit serie="KEC-ABCD-1234-5" />);
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ya te registraste/i }));

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Teléfono/)).not.toBeInTheDocument();
  });

  it('enviar sin email → error, sin fetch', () => {
    abrirFormulario();
    fireEvent.click(screen.getByRole('button', { name: /Enviarme el enlace/i }));

    const email = screen.getByLabelText('Email');
    expect(email.getAttribute('aria-describedby')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('envío correcto → fetch a /api/kit-avisos/enlace con JSON, mismo mensaje neutro sin el email', async () => {
    abrirFormulario();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@ejemplo.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviarme el enlace/i }));

    expect(fetch).toHaveBeenCalledWith('/api/kit-avisos/enlace', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ serie: 'KEC-ABCD-1234-5', email: 'ana@ejemplo.com' });

    const mensaje = await screen.findByText(/Si los datos son correctos/i);
    expect(mensaje).toBeInTheDocument();
    expect(mensaje.textContent).not.toContain('ana@ejemplo.com');
  });

  it('los objetivos llevan min-h-11', () => {
    abrirFormulario();
    expect(screen.getByLabelText('Email')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: /Enviarme el enlace/i })).toHaveClass('min-h-11');
  });
});
