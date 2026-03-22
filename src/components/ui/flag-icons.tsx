export const FLAG_SVGS: Record<string, React.FC<{ className?: string }>> = {
  es: function SpainFlag({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="24" height="16" fill="#c60b1e" />
        <rect y="4" width="24" height="8" fill="#ffc400" />
      </svg>
    )
  },
  en: function UKFlag({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 60 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <clipPath id="uk">
          <path d="M30 0 L60 15 L30 30 L0 15 Z" />
        </clipPath>
        <rect width="60" height="30" fill="#012169" clipPath="url(#uk)" />
        <path d="M0 15 L60 15 M30 0 L30 30" stroke="#fff" strokeWidth="6" clipPath="url(#uk)" />
        <path d="M0 15 L60 15 M30 0 L30 30" stroke="#C8102E" strokeWidth="4" clipPath="url(#uk)" />
        <path d="M15 0 L45 30 M45 0 L15 30" stroke="#fff" strokeWidth="10" clipPath="url(#uk)" />
        <path d="M15 0 L45 30 M45 0 L15 30" stroke="#C8102E" strokeWidth="6" clipPath="url(#uk)" />
      </svg>
    )
  },
  fr: function FranceFlag({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="8" height="16" fill="#002395" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#ED2939" />
      </svg>
    )
  },
  it: function ItalyFlag({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="8" height="16" fill="#009246" />
        <rect x="8" width="8" height="16" fill="#fff" />
        <rect x="16" width="8" height="16" fill="#CE2B37" />
      </svg>
    )
  },
  de: function GermanyFlag({ className }: { className?: string }) {
    return (
      <svg className={className} viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="24" height="5.33" fill="#000" />
        <rect y="5.33" width="24" height="5.33" fill="#DD0000" />
        <rect y="10.67" width="24" height="5.33" fill="#FFCE00" />
      </svg>
    )
  },
}
