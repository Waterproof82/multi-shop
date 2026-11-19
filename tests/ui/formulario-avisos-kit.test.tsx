/**
 * `FormularioAvisosKit` (sdd kit-expiry-m2b, M2b8a), R-M2b.1: divulgación
 * progresiva (R-M2b.1.1), tres casillas sin marcar con el texto EXACTO de
 * `TEXTOS_CONSENTIMIENTO` (R-M2b.1.3), errores accesibles sin llamar a la
 * API (R-M2b.1.2), y el mismo mensaje neutro tras enviar, sin eco del email
 * ni del teléfono (R-M2b.1.5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioAvisosKit } from '@/components/kit-publico/formulario-avisos-kit';
import { TEXTOS_CONSENTIMIENTO } from '@/lib/kit-caducidad/consentimiento';

// R-M2a.2.7 / editorial.ts (kitemergenciacanarias): urgencia falsa o respaldo oficial.
const TERMINOS_VETADOS = [
  'inminente',
  'cuenta atrás',
  'antes de que sea tarde',
  'solo hoy',
  'no esperes más',
  'en cualquier momento',
  'pánico',
  'recomendado por protección civil',
];

function abrirFormulario() {
  render(<FormularioAvisosKit serie="KEC-ABCD-1234-5" />);
  fireEvent.click(screen.getByRole('button', { name: /Quiero un aviso antes de que caduque/i }));
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 202 })));
});

describe('FormularioAvisosKit', () => {
  it('la casilla de privacidad tiene como nombre accesible el texto completo, enlace incluido', () => {
    abrirFormulario();

    expect(screen.getByRole('checkbox', { name: TEXTOS_CONSENTIMIENTO[0] })).toBeInTheDocument();
  });

  it('el botón despliega el formulario', () => {
    render(<FormularioAvisosKit serie="KEC-ABCD-1234-5" />);
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Quiero un aviso antes de que caduque/i }));

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('getByLabelText encuentra el email, el teléfono y las 3 casillas, todas sin marcar', () => {
    abrirFormulario();

    const email = screen.getByLabelText('Email');
    const telefono = screen.getByLabelText(/Teléfono/);
    expect(email).toBeInTheDocument();
    expect(telefono).toBeInTheDocument();

    for (const texto of TEXTOS_CONSENTIMIENTO) {
      const casilla = screen.getByLabelText(texto);
      expect(casilla).toHaveAttribute('type', 'checkbox');
      expect(casilla).not.toBeChecked();
    }
  });

  it('el texto de las casillas es exactamente TEXTOS_CONSENTIMIENTO', () => {
    abrirFormulario();
    for (const texto of TEXTOS_CONSENTIMIENTO) {
      expect(screen.getByLabelText(texto)).toBeInTheDocument();
    }
  });

  it('la primera casilla enlaza a /privacidad', () => {
    abrirFormulario();
    const enlace = screen.getByRole('link', { name: 'política de privacidad' });
    expect(enlace).toHaveAttribute('href', '/privacidad');
  });

  it('enviar sin la casilla de email → error con aria-describedby, sin fetch', () => {
    abrirFormulario();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@ejemplo.com' } });
    fireEvent.click(screen.getByLabelText(TEXTOS_CONSENTIMIENTO[0]));
    fireEvent.click(screen.getByRole('button', { name: /Quiero recibir avisos/i }));

    const casillaEmail = screen.getByLabelText(TEXTOS_CONSENTIMIENTO[1]);
    const idError = casillaEmail.getAttribute('aria-describedby');
    expect(idError).toBeTruthy();
    expect(document.getElementById(idError ?? '')).toHaveTextContent(/avisos por email/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('WhatsApp sin teléfono → error', () => {
    abrirFormulario();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@ejemplo.com' } });
    fireEvent.click(screen.getByLabelText(TEXTOS_CONSENTIMIENTO[0]));
    fireEvent.click(screen.getByLabelText(TEXTOS_CONSENTIMIENTO[1]));
    fireEvent.click(screen.getByLabelText(TEXTOS_CONSENTIMIENTO[2]));
    fireEvent.click(screen.getByRole('button', { name: /Quiero recibir avisos/i }));

    const casillaWhatsapp = screen.getByLabelText(TEXTOS_CONSENTIMIENTO[2]);
    const idError = casillaWhatsapp.getAttribute('aria-describedby');
    expect(idError).toBeTruthy();
    expect(document.getElementById(idError ?? '')).toHaveTextContent(/teléfono/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('envío correcto → fetch a /api/kit-avisos/alta con JSON, y el mensaje neutro sin el email', async () => {
    abrirFormulario();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@ejemplo.com' } });
    fireEvent.click(screen.getByLabelText(TEXTOS_CONSENTIMIENTO[0]));
    fireEvent.click(screen.getByLabelText(TEXTOS_CONSENTIMIENTO[1]));
    fireEvent.click(screen.getByRole('button', { name: /Quiero recibir avisos/i }));

    expect(fetch).toHaveBeenCalledWith('/api/kit-avisos/alta', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ serie: 'KEC-ABCD-1234-5', email: 'ana@ejemplo.com', aceptaPrivacidad: true, avisosEmail: true });

    const mensaje = await screen.findByText(/Si los datos son correctos/i);
    expect(mensaje).toBeInTheDocument();
    expect(mensaje.textContent).not.toContain('ana@ejemplo.com');
  });

  it('los objetivos llevan min-h-11', () => {
    abrirFormulario();
    expect(screen.getByLabelText('Email')).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: /Quiero recibir avisos/i })).toHaveClass('min-h-11');
  });

  it('ningún texto visible contiene un término vetado', () => {
    abrirFormulario();
    const formulario = document.querySelector('form');
    const texto = formulario?.textContent?.toLowerCase() ?? '';
    for (const termino of TERMINOS_VETADOS) {
      expect(texto).not.toContain(termino);
    }
  });
});
