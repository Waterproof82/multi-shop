'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { StarRating } from './star-rating';
import type { Language } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface GoogleReviewsWidgetProps {
  mesaId: string;
  sesionId: string | null;
  googleReviewsUrl: string | null;
  lang: Language;
  uniqueKey?: string;
}

function getRaterId(): string {
  try {
    const stored = localStorage.getItem('rater_id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('rater_id', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function getStoredRating(sesionId: string): number | null {
  try {
    const v = localStorage.getItem(`valoracion_${sesionId}`);
    return v !== null ? parseFloat(v) : null;
  } catch {
    return null;
  }
}

export function GoogleReviewsWidget({
  mesaId,
  sesionId,
  googleReviewsUrl,
  lang,
  uniqueKey,
}: Readonly<GoogleReviewsWidgetProps>) {
  const [submitted, setSubmitted] = useState(false);
  const [submittedValue, setSubmittedValue] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const raterIdRef = useRef<string | null>(null);

  const effectiveKey = sesionId ?? uniqueKey ?? null;

  useEffect(() => {
    if (!effectiveKey) return;
    raterIdRef.current = getRaterId();
    const stored = getStoredRating(effectiveKey);
    if (stored !== null) {
      setSubmittedValue(stored);
      setSubmitted(true);
    }
  }, [effectiveKey]);

  if (!effectiveKey || !googleReviewsUrl) return null;

  const handleChange = async (stars: number) => {
    if (submitted || submitting || !effectiveKey || !raterIdRef.current) return;
    setSubmitting(true);
    try {
      if (sesionId && mesaId) {
        await fetch(`/api/mesas/${encodeURIComponent(mesaId)}/valoracion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            estrellas: stars,
            sesion_id: sesionId,
            rater_id: raterIdRef.current,
          }),
        });
      }
      try {
        localStorage.setItem(`valoracion_${effectiveKey}`, stars.toString());
      } catch { /* ignore */ }
      setSubmittedValue(stars);
      setSubmitted(true);
      if (stars >= 4 && googleReviewsUrl) {
        window.open(googleReviewsUrl, '_blank', 'noopener,noreferrer');
      }
    } catch { /* best-effort — no UI error */ }
    finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <div className="flex items-center gap-2">
        <Image
          src="/g-reviews-icon.png"
          alt="Google Reviews"
          width={28}
          height={28}
          className="object-contain"
        />
        <StarRating
          value={submittedValue}
          onChange={handleChange}
          disabled={submitted || submitting}
          size={28}
        />
      </div>
      <p
        className="text-xs tracking-widest uppercase"
        style={{ color: '#b0a090', fontFamily: 'monospace' }}
      >
        {submitted ? t('mesaRatingThanks', lang) : t('mesaRateUs', lang)}
      </p>
    </div>
  );
}
