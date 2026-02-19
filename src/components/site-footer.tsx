"use client"

import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabaseClient"

export function SiteFooter() {
  const { language } = useLanguage()
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  useEffect(() => {
    const fetchLogo = async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("logo_url")
        .limit(1)
        .single()
      if (!error && data?.logo_url) {
        setLogoUrl(data.logo_url)
      }
    }
    fetchLogo()
  }, [])
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Mermelada de Tomate"
              className="h-16 w-auto opacity-80"
            />
          )}
          <p className="max-w-md font-serif text-lg italic text-muted-foreground">
            {"\"...il risultato di farlo con amore\""}
          </p>
          <div className="text-sm text-muted-foreground">
            <p>{t("allergenDisclaimer", language)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>{t("allergenCrustaceans", language)}</span>
            <span>{t("allergenFish", language)}</span>
            <span>{t("allergenEggs", language)}</span>
            <span>{t("allergenPeanuts", language)}</span>
            <span>{t("allergenSoy", language)}</span>
            <span>{t("allergenDairy", language)}</span>
            <span>{t("allergenTreeNuts", language)}</span>
            <span>{t("allergenCelery", language)}</span>
            <span>{t("allergenMolluscs", language)}</span>
            <span>{t("allergenLupin", language)}</span>
            <span>{t("allergenMustard", language)}</span>
            <span>{t("allergenSesame", language)}</span>
            <span>{t("allergenSulphites", language)}</span>
          </div>
        </div>
        <div className="mt-8 text-center">
          <a 
            href="/admin/login" 
            className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors"
          >
            Admin
          </a>
        </div>
      </div>
    </footer>
  )
}
