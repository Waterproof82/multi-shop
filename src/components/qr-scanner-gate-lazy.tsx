'use client';

import dynamic from 'next/dynamic';
import type { QRGateState } from '@/components/qr-scanner-gate';

export type { QRGateState };

/**
 * Carga diferida del lector de QR.
 *
 * POR QUÉ
 * `qr-scanner-gate` importa `@zxing/browser`, que arrastra `@zxing/library`: un
 * decodificador de códigos de barras completo, ~1,4 MB de JS sin minificar. Iba
 * en el chunk inicial de DOS páginas de cara al cliente — la carta pública
 * (`cart-drawer`) y la cuenta de la mesa (`mesa-orders-client`)— porque el import
 * era estático.
 *
 * Y en ninguna de las dos se muestra por defecto. El comensal llega escaneando el
 * QR de la mesa, así que YA trae token: la puerta solo aparece cuando el token
 * caduca o la sesión se cierra. Es decir, el caso raro pagaba el peaje del caso
 * normal, y lo pagaba en el peor sitio posible: el móvil de un cliente, con datos
 * móviles, sentado a la mesa esperando la carta.
 *
 * `ssr: false` porque el componente usa `navigator.mediaDevices` y un `<video>`:
 * no hay nada que renderizar en el servidor.
 *
 * SOBRE EL HUECO DE DESCARGA
 * Al abrirse la puerta hay que traer el chunk. No es un riesgo real aquí: la
 * puerta se abre justo DESPUÉS de una respuesta del servidor (token caducado,
 * sesión cerrada), así que la red acaba de demostrar que funciona. Aun así se
 * pinta un `loading` con el mismo overlay del componente real, para que la
 * transición no sea un parpadeo en blanco sobre la carta.
 *
 * El módulo pesado ya no lo importa nadie de forma estática — es lo que permite
 * al bundler sacarlo del chunk inicial. Si alguien vuelve a importar
 * `@/components/qr-scanner-gate` directamente, el ahorro desaparece en silencio.
 */
export const QRScannerGate = dynamic(
  () => import('@/components/qr-scanner-gate').then((m) => m.QRScannerGate),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm p-6">
        <div className="w-64 h-64 rounded-2xl bg-muted animate-pulse" />
      </div>
    ),
  },
);
