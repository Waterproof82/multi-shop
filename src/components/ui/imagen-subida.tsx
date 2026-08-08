import Image, { type ImageProps } from 'next/image';

/**
 * Imagen que YA viene optimizada, así que no vuelve a pasar por Vercel.
 *
 * POR QUÉ EXISTE
 * Todo lo que sube `ImageUploader` pasa antes por `optimizeImage()`
 * (`src/lib/image-utils.ts`): se reescala a 480×480 como máximo y se convierte
 * a WebP con calidad 0.8. Es decir, lo que hay en R2 **ya está en su tamaño
 * final y en el formato bueno**.
 *
 * Pasarlo además por el optimizador de Vercel no mejora nada y cuesta dinero:
 *
 *   - `next/image` con `sizes` en unidades `vw` genera el srcset con los ocho
 *     anchos de dispositivo por defecto: 640, 750, 828, 1080, 1200, 1920, 2048
 *     y 3840. **Los ocho son mayores que el original de 480 px**, así que las
 *     ocho variantes son un reescalado HACIA ARRIBA de algo que ya estaba en su
 *     tamaño: se paga una transformación por cada una y la imagen sale peor.
 *
 *   - Con 38 fotos de producto, una sola carga en frío de la carta podía
 *     disparar del orden de 300 transformaciones. Y basta un bot rastreando
 *     (`robots.ts` permite `/`) o que expire la caché de 4 h para repetirlo.
 *
 * `unoptimized` sirve la imagen tal cual desde su origen. Se conservan `fill`,
 * `sizes`, `className` y el resto del API de `next/image`, así que el layout no
 * cambia: lo único que desaparece es el rodeo por el optimizador.
 *
 * CUÁNDO **NO** USAR ESTO
 * Si algún día se sirve una imagen que NO pasa por `ImageUploader` —subida por
 * un tercero, traída de una API externa, o un original grande sin reescalar—,
 * usar `next/image` normal: ahí el reescalado por dispositivo sí aporta.
 *
 * El banner de empresa no aplica: se pinta como `backgroundImage` en CSS
 * (`hero-banner.tsx`), no con `next/image`.
 */
export function ImagenSubida(props: Readonly<ImageProps>) {
  // jsx-a11y no puede seguir el `alt` a través del spread, pero `ImageProps` lo
  // exige: omitirlo en quien llame a este componente es un error de tipos, no un
  // fallo de accesibilidad que se cuele.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image {...props} unoptimized />;
}
