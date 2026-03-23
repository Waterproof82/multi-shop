"use client"

import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLanguage, type Language } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { FLAG_SVGS } from "@/components/ui/flag-icons"

const languages: { code: Language; label: string }[] = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
]

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage()

  const currentLang = languages.find(l => l.code === language) || languages[0]
  const FlagIcon = FLAG_SVGS[currentLang.code]

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2" aria-label={t("selectLanguage", language)} id="language-selector-trigger">
          {FlagIcon && <FlagIcon className="w-5 h-3.5 rounded-sm" />}
          <Languages className="size-4" />
          <span className="text-xs font-medium uppercase">{currentLang.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {languages.map((lang) => {
          const LangFlag = FLAG_SVGS[lang.code]
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className="flex items-center gap-3"
              aria-current={language === lang.code ? "true" : undefined}
            >
              {LangFlag && <LangFlag className="w-6 h-4 rounded-sm shrink-0" />}
              <span className={language === lang.code ? "font-semibold" : ""}>
                {lang.label}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
