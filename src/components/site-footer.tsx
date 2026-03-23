"use client"

import { MapPin, Mail, Globe, Phone, Settings, Camera, Link } from "lucide-react"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface SiteFooterProps {
  readonly empresa?: EmpresaPublic | null;
}

export function SiteFooter({ empresa }: SiteFooterProps) {
  const { language } = useLanguage()
  const currentYear = new Date().getFullYear()

  if (!empresa) return null

  return (
    <footer className="w-full bg-foreground text-background/80 mt-12 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">

          {/* Columna 1: Redes Sociales */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-background uppercase tracking-wider">{t("socialMedia", language)}</h3>
            <ul className="flex gap-4 pt-1">
              {empresa.instagram && (
                <li>
                  <a href={empresa.instagram} target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm" aria-label="Instagram">
                    <Camera className="w-5 h-5" />
                  </a>
                </li>
              )}
              {empresa.fb && (
                <li>
                  <a href={empresa.fb} target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm" aria-label="Facebook">
                    <Link className="w-5 h-5" />
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Columna 2: Contacto */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-background uppercase tracking-wider">{t("contact", language)}</h3>
            <ul className="space-y-3">
              {empresa.direccion && (
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-background/40 shrink-0 mt-0.5" />
                  <span className="text-sm text-background/75">{empresa.direccion}</span>
                </li>
              )}
              {empresa.telefono && (() => {
                const telefonoDigits = empresa.telefono.replaceAll(/\D/g, '');
                const telefonoDisplay = telefonoDigits.replace(/^(00|\+)?34/, '');
                return (
                <li className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-background/40 shrink-0" />
                  <a href={`tel:${telefonoDigits}`} className="text-sm text-background/75 hover:text-background transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm">
                    {telefonoDisplay}
                  </a>
                </li>
                );
              })()}
              {empresa.emailNotification && (
                <li className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-background/40 shrink-0" />
                  <a href={`mailto:${empresa.emailNotification}`} className="text-sm text-background/75 hover:text-background transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm">
                    {empresa.emailNotification}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-background/40 shrink-0" />
                <span className="text-sm text-background/75">{empresa.dominio}</span>
              </li>
            </ul>
          </div>

          {/* Columna 3: Mapa */}
          {empresa.urlMapa && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-background uppercase tracking-wider">{t("location", language)}</h3>
              <div className="rounded-lg overflow-hidden border border-background/10 h-48 w-full">
                <iframe
                  title={t("locationIframe", language)}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={empresa.urlMapa}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-background/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-background/40">
          <p>© {currentYear} {empresa.nombre}</p>
          <a
            href="/admin/login"
            rel="nofollow"
            className="text-primary hover:text-primary/80 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm"
            aria-label="Admin"
          >
            <Settings className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  )
}
