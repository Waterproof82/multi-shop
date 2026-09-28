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
  onImageClick?: () => void;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
}

/**
 * Imagen grande + tira de miniaturas para elegir entre las (hasta 2) fotos
 * de un producto. Con una sola imagen no renderiza miniaturas — el output
 * es idéntico a un <ImagenSubida> suelto.
 */
// Miniatura activa: marco en el color del tenant; el resto, filete casi invisible.
function miniaturaClass(activa: boolean): string {
  if (activa) return 'border-primary';
  return 'border-foreground/10 hover:border-foreground/40';
}

export function ProductImageGallery({
  images,
  alt,
  objectFit,
  mainImageClassName,
  sizes,
  onImageClick,
  initialIndex = 0,
  onIndexChange,
}: Readonly<ProductImageGalleryProps>) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const activeSrc = images[selectedIndex] ?? images[0];

  function selectIndex(index: number) {
    setSelectedIndex(index);
    onIndexChange?.(index);
  }
  const mainImage = (
    <ImagenSubida
      src={activeSrc}
      alt={alt}
      fill
      className={`object-${objectFit || 'cover'}`}
      sizes={sizes}
    />
  );

  return (
    <div>
      {onImageClick ? (
        <button type="button" className={mainImageClassName} onClick={onImageClick} aria-label={alt}>
          {mainImage}
        </button>
      ) : (
        <div className={mainImageClassName}>{mainImage}</div>
      )}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 border-t border-foreground/10 bg-background px-3 py-3">
          {images.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => selectIndex(index)}
              aria-label={`${alt} ${index + 1}`}
              aria-current={index === selectedIndex}
              className={`relative h-12 w-12 shrink-0 overflow-hidden border-2 bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${miniaturaClass(index === selectedIndex)}`}
            >
              <ImagenSubida src={src} alt="" fill className="object-cover" sizes="48px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
