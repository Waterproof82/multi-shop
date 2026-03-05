'use client';

import { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

export function PromoToast() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    // Only run on client
    const params = new URLSearchParams(window.location.search);
    const promoStatus = params.get('promo');
    const error = params.get('error');

    if (promoStatus === 'on') {
      setMessage('¡Te has dado de alta en las promociones!');
      setType('success');
      setVisible(true);
    } else if (promoStatus === 'off') {
      setMessage('¡Te has dado de baja en las promociones!');
      setType('success');
      setVisible(true);
    } else if (error === 'notfound') {
      setMessage('No se encontró tu cuenta. Contacta con la empresa.');
      setType('error');
      setVisible(true);
    } else if (error === 'invalid') {
      setMessage('Enlace inválido.');
      setType('error');
      setVisible(true);
    } else if (error === 'internal') {
      setMessage('Error interno. Intenta de nuevo.');
      setType('error');
      setVisible(true);
    } else if (error) {
      setMessage(`Error: ${error}`);
      setType('error');
      setVisible(true);
    }

    if (visible) {
      // Remove query params after showing
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={() => setVisible(false)}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in duration-200">
        <button
          onClick={() => setVisible(false)}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        <div className="text-center">
          {type === 'success' ? (
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          ) : (
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          )}
          
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {type === 'success' ? '¡Listo!' : 'Error'}
          </h3>
          
          <p className="text-gray-600 dark:text-gray-300">
            {message}
          </p>

          <button
            onClick={() => setVisible(false)}
            className="mt-6 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
