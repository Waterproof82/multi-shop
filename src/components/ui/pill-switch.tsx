'use client';

interface PillSwitchProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: () => void;
  readonly ariaLabel?: string;
  readonly size?: 'sm' | 'md';
}

const SIZE = {
  sm: { track: 'h-5 w-9', thumb: 'h-4 w-4', translate: 'translate-x-4' },
  md: { track: 'h-6 w-11', thumb: 'h-5 w-5', translate: 'translate-x-5' },
};

export function PillSwitch({ checked, disabled = false, onChange, ariaLabel, size = 'md' }: PillSwitchProps) {
  const { track, thumb, translate } = SIZE[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex ${track} flex-shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 ${
        checked ? 'bg-switch-active' : 'bg-switch-inactive'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block ${thumb} rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
          checked ? translate : 'translate-x-0'
        }`}
      />
    </button>
  );
}
