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
 * Ampliacion de la(s) foto(s) de un producto, con el lenguaje editorial de la
 * carta: marco recto sin sombra, la foto sobre fondo blanco fijo (`bg-white`,
 * no token: igual que las cards, las fotos de producto vienen sobre blanco) y el
 * nombre del producto como pie de foto visible — la foto sola no dice de que
 * producto es. La cruz va en su propio boton opaco de 44px (objetivo tactil
 * minimo) para no heredar el contraste de la foto de fondo.
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
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[3px] border border-foreground/10 bg-background p-0 shadow-none sm:max-w-2xl"
      >
        <ProductImageGallery
          images={images}
          alt={alt}
          objectFit={objectFit ?? 'contain'}
          mainImageClassName="relative block aspect-square w-full bg-white sm:aspect-[4/3]"
          sizes="(max-width: 768px) 100vw, 700px"
          initialIndex={initialIndex}
        />
        {/* Pie de foto: el titulo accesible del dialogo, ahora tambien visible. */}
        <DialogHeader className="border-t border-foreground/10 px-5 py-4 text-left">
          <DialogTitle className="pr-2 font-serif text-xl font-normal leading-snug tracking-[-0.01em] [font-variant-numeric:lining-nums] [overflow-wrap:anywhere]">
            {alt}
          </DialogTitle>
          <DialogDescription className="sr-only">{alt}</DialogDescription>
        </DialogHeader>
        <DialogClose
          className="absolute top-3 right-3 z-10 flex size-11 items-center justify-center rounded-[3px] border border-foreground/10 bg-background text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <XIcon className="size-5" aria-hidden="true" />
          <span className="sr-only">{t('close', language)}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
