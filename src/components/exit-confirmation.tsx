'use client';

import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-context';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

/**
 * Componente que maneja la confirmación al salir de la página en móvil.
 * Muestra un popup cuando el usuario intenta salir de la home.
 */
export function ExitConfirmation() {
  const { isCartOpen } = useCart();
  const { language } = useLanguage();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detectar si es dispositivo móvil
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(pointer: coarse)').matches);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isMobile || isCartOpen) return;

    // Manejar el evento popstate para detectar cuando el usuario toca "atrás"
    const handlePopState = (event: PopStateEvent) => {
      // Si no hay estado de carrito, preguntamos si quiere salir
      // Usamos confirm() nativo ya que es lo único que funciona confiablemente
      if (!window.history.state || window.history.state.cartOpen !== true) {
        // Verificar si es la página inicial (sin history stack adicional)
        const wantsToLeave = confirm(
          t('exitConfirmationMessage', language) || '¿Seguro que quieres salir?'
        );
        
        if (!wantsToLeave) {
          // Si no quiere salir, empujamos el estado de nuevo
          window.history.pushState({ exitConfirmation: true }, '', window.location.href);
        }
        // Si quiere salir, el navegador continuará con la navegación hacia atrás
      }
    };

    // Agregar estado inicial para la página home
    window.history.pushState({ exitConfirmation: true }, '', window.location.href);
    
    window.addEventListener('popstate', handlePopState);
    
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isMobile, isCartOpen, language]);

  // Este componente no renderiza nada
  return null;
}
