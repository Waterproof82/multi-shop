'use client';

import { useRef, useState } from 'react';

interface StarRatingProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: number;
}

function StarIcon({ fill, size, id }: { fill: 'full' | 'half' | 'empty'; size: number; id: string }) {
  if (fill === 'full') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#f5a623" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  if (fill === 'empty') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d4c9b8" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
          <stop offset="50%" stopColor="#f5a623" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={`url(#${id})`}
        stroke="#d4c9b8"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function StarRating({ value, onChange, disabled = false, size = 28 }: Readonly<StarRatingProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  function getValueFromX(clientX: number): number {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(0.5, Math.min(5, Math.round(ratio * 10) / 2));
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (disabled) return;
    setHoverValue(getValueFromX(e.touches[0].clientX));
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (disabled) return;
    const v = getValueFromX(e.changedTouches[0].clientX);
    setHoverValue(null);
    onChange(v);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (disabled) return;
    setHoverValue(getValueFromX(e.clientX));
  }

  function handleMouseLeave() {
    setHoverValue(null);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (disabled) return;
    onChange(getValueFromX(e.clientX));
  }

  return (
    <div
      ref={containerRef}
      className={`flex gap-0.5 ${disabled ? 'opacity-80' : 'cursor-pointer select-none'}`}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      style={{ touchAction: 'none' }}
      role="slider"
      aria-valuenow={value}
      aria-valuemin={0.5}
      aria-valuemax={5}
      aria-disabled={disabled}
    >
      {[1, 2, 3, 4, 5].map(star => {
        let fill: 'full' | 'half' | 'empty';
        if (displayValue >= star) fill = 'full';
        else if (displayValue >= star - 0.5) fill = 'half';
        else fill = 'empty';
        return <StarIcon key={star} fill={fill} size={size} id={`star-half-${star}`} />;
      })}
    </div>
  );
}
