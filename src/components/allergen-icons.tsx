import { t } from '@/lib/translations';
import type { translations } from '@/lib/translations';
import type { Language } from '@/lib/language-context';

export type AllergenKey =
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'peanuts'
  | 'soy'
  | 'dairy'
  | 'treenuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulphites'
  | 'lupin'
  | 'molluscs';

export const ALLERGEN_KEYS: readonly AllergenKey[] = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts',
  'soy', 'dairy', 'treenuts', 'celery', 'mustard',
  'sesame', 'sulphites', 'lupin', 'molluscs',
] as const;

export const ALLERGEN_TRANSLATION_KEY: Record<AllergenKey, keyof typeof translations['es']> = {
  gluten: 'allergenGluten',
  crustaceans: 'allergenCrustaceans',
  eggs: 'allergenEggs',
  fish: 'allergenFish',
  peanuts: 'allergenPeanuts',
  soy: 'allergenSoy',
  dairy: 'allergenDairy',
  treenuts: 'allergenTreeNuts',
  celery: 'allergenCelery',
  mustard: 'allergenMustard',
  sesame: 'allergenSesame',
  sulphites: 'allergenSulphites',
  lupin: 'allergenLupin',
  molluscs: 'allergenMolluscs',
};

type SvgProps = Readonly<React.SVGProps<SVGSVGElement>>;

const baseProps = {
  viewBox: '0 0 24 24',
  stroke: 'currentColor' as const,
  fill: 'none' as const,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function GlutenIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 2v20" />
      <path d="M8 6c0 0 1-2 4-2s4 2 4 2" />
      <path d="M7 10c0 0 1.5-2 5-2s5 2 5 2" />
      <path d="M6 14c0 0 2-2 6-2s6 2 6 2" />
      <path d="M5 18c0 0 2.5-2 7-2s7 2 7 2" />
    </svg>
  );
}

export function CrustaceansIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 19c2-2 3-5 3-8 0-3 2-5 5-5 2 0 3 1 3 3-1 2-3 3-5 3-1 0-2 1-2 2" />
      <path d="M9 11c0 0 1-2 3-2" />
      <path d="M6 19l-2 2M8 17l-2 1" />
    </svg>
  );
}

export function EggsIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <ellipse cx="12" cy="13" rx="5" ry="7" />
      <path d="M12 8c0-3-2-5-4-5" />
    </svg>
  );
}

export function FishIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M2 12c2-4 6-7 10-7s8 3 10 7c-2 4-6 7-10 7S4 16 2 12z" />
      <path d="M17 12l3-3v6l-3-3z" />
      <circle cx="9" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

export function PeanutsIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 4c-2 0-4 2-4 4 0 1.5 1 3 2.5 3.5C9 12 9 13.5 7.5 14 6 14.5 5 16 5 17.5 5 20 7 22 9 22h6c2 0 4-2 4-4.5 0-1.5-1-3-2.5-3.5C14 13 14 11.5 15.5 11 17 10.5 18 9 18 7.5 18 5.5 16.5 4 15 4H9z" />
      <line x1="12" y1="7" x2="12" y2="8" />
      <line x1="12" y1="16" x2="12" y2="17" />
    </svg>
  );
}

export function SoyIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="9" r="3" />
      <circle cx="8" cy="15" r="3" />
      <circle cx="16" cy="15" r="3" />
      <path d="M12 12v5" />
    </svg>
  );
}

export function DairyIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 3h8l1 5H7L8 3z" />
      <rect x="6" y="8" width="12" height="13" rx="2" />
      <path d="M6 13h12" />
    </svg>
  );
}

export function TreenutsIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3C8 3 5 6 5 10c0 5 4 9 7 11 3-2 7-6 7-11 0-4-3-7-7-7z" />
      <path d="M12 3v20" />
      <path d="M5 10h14" />
    </svg>
  );
}

export function CeleryIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 22V8" />
      <path d="M12 8c0 0-3-4-5-6" />
      <path d="M12 8c0 0 3-4 5-6" />
      <path d="M12 13c0 0-2-3-4-4" />
      <path d="M12 13c0 0 2-3 4-4" />
      <path d="M12 18c0 0-2-2-3-3" />
      <path d="M12 18c0 0 2-2 3-3" />
    </svg>
  );
}

export function MustardIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="6" r="3" />
      <path d="M12 9v13" />
      <path d="M8 14c0 0 1-2 4-2s4 2 4 2" />
      <path d="M9 18c0 0 1-1 3-1s3 1 3 1" />
    </svg>
  );
}

export function SesameIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <ellipse cx="12" cy="5" rx="2" ry="3" transform="rotate(-20 12 5)" />
      <ellipse cx="8" cy="13" rx="2" ry="3" transform="rotate(20 8 13)" />
      <ellipse cx="16" cy="13" rx="2" ry="3" transform="rotate(-20 16 13)" />
      <path d="M12 8l-3 4M12 8l3 4" />
    </svg>
  );
}

export function SulphitesIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M8 3h8l-2 8H10L8 3z" />
      <path d="M10 11c0 3 2 5 2 5s2-2 2-5" />
      <line x1="12" y1="16" x2="12" y2="20" />
      <line x1="9" y1="20" x2="15" y2="20" />
    </svg>
  );
}

export function LupinIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 22V6" />
      <ellipse cx="12" cy="4" rx="2" ry="2" />
      <path d="M12 10c-2-1-4 0-4 2s2 3 4 2" />
      <path d="M12 10c2-1 4 0 4 2s-2 3-4 2" />
      <path d="M12 15c-2-1-4 0-4 2s2 3 4 2" />
      <path d="M12 15c2-1 4 0 4 2s-2 3-4 2" />
    </svg>
  );
}

export function MolluscsIcon(props: SvgProps): React.ReactElement {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 21c-5 0-9-4-9-9 0-3 2-5 3-5" />
      <path d="M12 21c5 0 9-4 9-9 0-3-2-5-3-5" />
      <path d="M6 7c1-2 3-4 6-4s5 2 6 4" />
      <path d="M8 10c1-1 2-2 4-2s3 1 4 2" />
      <path d="M10 13c0-1 1-2 2-2s2 1 2 2" />
    </svg>
  );
}

const ALLERGEN_ICON_MAP: Record<AllergenKey, (props: SvgProps) => React.ReactElement> = {
  gluten: GlutenIcon,
  crustaceans: CrustaceansIcon,
  eggs: EggsIcon,
  fish: FishIcon,
  peanuts: PeanutsIcon,
  soy: SoyIcon,
  dairy: DairyIcon,
  treenuts: TreenutsIcon,
  celery: CeleryIcon,
  mustard: MustardIcon,
  sesame: SesameIcon,
  sulphites: SulphitesIcon,
  lupin: LupinIcon,
  molluscs: MolluscsIcon,
};

export function AllergenIcon({
  allergen,
  ...props
}: Readonly<{ allergen: AllergenKey } & React.SVGProps<SVGSVGElement>>): React.ReactElement | null {
  const Icon = ALLERGEN_ICON_MAP[allergen];
  if (!Icon) return null;
  return <Icon {...props} />;
}

export function AllergenBadges({
  alergenos,
  className,
}: Readonly<{ alergenos?: string[]; className?: string }>): React.ReactElement | null {
  if (!alergenos?.length) return null;
  return (
    <div className={`flex flex-wrap gap-1${className ? ` ${className}` : ''}`}>
      {alergenos.map((a) => (
        <AllergenIcon
          key={a}
          allergen={a as AllergenKey}
          className="w-5 h-5 text-muted-foreground"
        />
      ))}
    </div>
  );
}

export function AllergenList({
  alergenos,
  language,
}: Readonly<{ alergenos?: string[]; language: Language }>): React.ReactElement | null {
  if (!alergenos?.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {t('allergensSectionTitle', language)}
      </p>
      <div className="flex flex-wrap gap-2">
        {alergenos.map((a) => {
          const key = a as AllergenKey;
          const tKey = ALLERGEN_TRANSLATION_KEY[key];
          const label = tKey ? t(tKey, language) : a;
          return (
            <span
              key={a}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-2 py-1"
            >
              <AllergenIcon allergen={key} className="w-5 h-5 shrink-0" />
              <span>{label}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
