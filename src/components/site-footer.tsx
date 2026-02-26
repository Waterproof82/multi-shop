"use client"

import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { EmpresaInfo } from "@/lib/server-services"

interface SiteFooterProps {
  empresa?: EmpresaInfo | null;
}

export function SiteFooter({ empresa }: SiteFooterProps) {
  const { language } = useLanguage()
  const logoUrl = empresa?.logoUrl ?? null
  
  const footer1 = empresa?.footer1?.[language] ?? empresa?.footer1?.es ?? null
  const footer2Raw = empresa?.footer2?.[language] ?? empresa?.footer2?.es ?? null
  const footer2List = footer2Raw ? footer2Raw.split('|') : null

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={empresa?.nombre ?? "Logo"}
              className="h-16 w-auto opacity-80"
            />
          )}
          {footer1 && (
            <div className="text-sm text-muted-foreground">
              <p>{footer1}</p>
            </div>
          )}
          {footer2List ? (
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              {footer2List.map((item, index) => (
                <span key={index}>{item.trim()}</span>
              ))}
            </div>
          ) : null}
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
