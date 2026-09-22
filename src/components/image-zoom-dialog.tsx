'use client';

import { XIcon } from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProductImageGallery } from '@/components/product-image-gallery';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import type { ImageFit } from '@/core/application/dtos/menu-view-model';

interface ImageZoomDialogProps {
  images: string[];
  alt: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectFit?: ImageFit;
  initialIndex?: number;
}

/**
 * Recuadro elegante para ampliar la(s) foto(s) de un producto. La cruz de
 * cerrar vive en su propio circulo con contraste fijo (no hereda el color
 * de la foto de fondo), y la tira de miniaturas de ProductImageGallery
 * queda enmarcada dentro de la misma tarjeta en vez de flotar suelta.
 */
export function ImageZoomDialog({
  images,
  alt,
  open,
  onOpenChange,
  objectFit,
  initialIndex,
}: Readonly<ImageZoomDialogProps>) {
  const { language } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-border bg-background p-0 shadow-elegant-lg sm:max-w-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{alt}</DialogTitle>
          <DialogDescription>{alt}</DialogDescription>
        </DialogHeader>
        <ProductImageGallery
          images={images}
          alt={alt}
          objectFit={objectFit ?? 'contain'}
          mainImageClassName="relative aspect-square w-full sm:aspect-[4/3]"
          sizes="(max-width: 768px) 100vw, 700px"
          initialIndex={initialIndex}
        />
        <DialogClose
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white shadow-elegant backdrop-blur-sm transition-colors hover:bg-black/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
        >
          <XIcon className="h-4 w-4" />
          <span className="sr-only">{t('close', language)}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
