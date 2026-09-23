'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ImagenSubida as Image } from './ui/imagen-subida';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

const AUTOPLAY_MS = 5000;

interface SliderBannerProps {
  readonly slides: string[];
  readonly empresaNombre: string;
}

function nextIndex(current: number, total: number): number {
  return (current + 1) % total;
}

function previousIndex(current: number, total: number): number {
  return (current - 1 + total) % total;
}

// Chequeo directo via matchMedia en vez de framer-motion's useReducedMotion():
// ese hook cachea el resultado a nivel de modulo (initPrefersReducedMotion
// corre una sola vez por proceso), asi que no reacciona a un cambio real del
// setting del SO despues del primer mount del proceso.
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SliderBanner({ slides, empresaNombre }: Readonly<SliderBannerProps>) {
  const { language } = useLanguage();
  const shouldReduceMotion = prefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (shouldReduceMotion || paused || slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((current) => nextIndex(current, slides.length));
    }, AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [shouldReduceMotion, paused, slides.length, index]);

  if (slides.length === 0) return null;

  const altText = `${t('bannerSliderAlt', language)} ${empresaNombre}`;

  return (
    <div
      data-testid="slider-banner-root"
      className="relative h-[200px] md:h-[280px] overflow-hidden bg-primary"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((url, i) => (
        <motion.div
          key={url}
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: i === index ? 1 : 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
        >
          <Image
            src={url}
            alt={altText}
            fill
            className="object-cover"
            sizes="100vw"
            priority={i === 0}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        </motion.div>
      ))}

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setIndex(previousIndex(index, slides.length))}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center bg-card/70 backdrop-blur-sm rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:bg-card/90"
            aria-label={t('bannerSliderPrevious', language)}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setIndex(nextIndex(index, slides.length))}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center bg-card/70 backdrop-blur-sm rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors hover:bg-card/90"
            aria-label={t('bannerSliderNext', language)}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {slides.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setIndex(i)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={`${t('bannerSliderGoTo', language)} ${i + 1}`}
              >
                <span className={`block w-2 h-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
