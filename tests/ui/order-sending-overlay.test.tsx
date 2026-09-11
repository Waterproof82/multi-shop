import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { SendingOverlay } from '@/components/cart-drawer';

afterEach(() => cleanup());

describe('SendingOverlay', () => {
  it('no renderiza nada cuando show=false', () => {
    const { container } = render(<SendingOverlay show={false} language="es" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra el mensaje de confirmación cuando show=true', () => {
    render(<SendingOverlay show={true} language="es" />);
    expect(screen.getByText('Confirmando pedido...')).toBeInTheDocument();
  });

  it('respeta el idioma', () => {
    render(<SendingOverlay show={true} language="en" />);
    expect(screen.getByText('Confirming order...')).toBeInTheDocument();
  });
});
