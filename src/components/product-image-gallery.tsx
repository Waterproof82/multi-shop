'use client';

import { useState } from 'react';
import { ImagenSubida } from '@/components/ui/imagen-subida';
import type { ImageFit } from '@/core/application/dtos/menu-view-model';

interface ProductImageGalleryProps {
  images: string[];
  alt: string;
  objectFit?: ImageFit;
  mainImageClassName: string;
  sizes: string;
}

/**
 * Imagen grande + tira de miniaturas para elegir entre las (hasta 2) fotos
 * de un producto. Con una sola imagen no renderiza miniaturas — el output
 * es idéntico a un <ImagenSubida> suelto.
 */
export function ProductImageGallery({
  images,
  alt,
  objectFit,
  mainImageClassName,
  sizes,
}: Readonly<ProductImageGalleryProps>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeSrc = images[selectedIndex] ?? images[0];

  return (
    <div>
      <div className={mainImageClassName}>
        <ImagenSubida
          src={activeSrc}
          alt={alt}
          fill
          className={`object-${objectFit || 'cover'}`}
          sizes={sizes}
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 justify-center py-2 bg-background/95">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setSelectedIndex(index)}
              aria-label={`${alt} ${index + 1}`}
              aria-current={index === selectedIndex}
              className={`relative h-12 w-12 shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
                index === selectedIndex ? 'border-primary' : 'border-border'
              }`}
            >
              <ImagenSubida src={src} alt="" fill className="object-cover" sizes="48px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
