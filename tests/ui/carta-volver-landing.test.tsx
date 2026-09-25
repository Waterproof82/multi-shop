import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { CartProvider } from '@/lib/cart-context';
import { SiteHeaderClient } from '@/components/site-header-client';

// Enlace (icono de casa) de la cabecera de la carta: lleva de /carta a la landing.
// CartaRoute solo lo activa en /carta y fuera de mesa/camarero/pedidos.
function renderHeader(mostrarVolverLanding?: boolean) {
  return render(
    <LanguageProvider>
      <CartProvider>
        <SiteHeaderClient showCart={false} empresa={null} mostrarVolverLanding={mostrarVolverLanding} />
      </CartProvider>
    </LanguageProvider>
  );
}

describe('cabecera de la carta — enlace de vuelta a la landing', () => {
  it('con mostrarVolverLanding pinta un enlace a "/"', () => {
    renderHeader(true);
    const enlace = screen.getByRole('link', { name: 'Volver a la página de inicio' });
    expect(enlace).toHaveAttribute('href', '/');
    // Solo icono de casa, sin texto visible.
    expect(enlace).toHaveTextContent('');
    expect(enlace.querySelector('svg')).not.toBeNull();
  });

  it('por defecto no pinta el enlace', () => {
    renderHeader();
    expect(screen.queryByRole('link', { name: 'Volver a la página de inicio' })).not.toBeInTheDocument();
  });
});
