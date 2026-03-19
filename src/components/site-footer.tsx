"use client"

import { MapPin, Mail, Globe, Phone, Settings } from "lucide-react"
import { useLanguage, type Language } from "@/lib/language-context"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface SiteFooterProps {
  readonly empresa?: EmpresaPublic | null;
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

const translations = {
  es: {
    contacto: "Contacto",
    ubicacion: "Ubicación",
    redesSociales: "Redes Sociales",
  },
  en: {
    contacto: "Contact",
    ubicacion: "Location",
    redesSociales: "Social Media",
  },
  fr: {
    contacto: "Contact",
    ubicacion: "Emplacement",
    redesSociales: "Réseaux Sociaux",
  },
  it: {
    contacto: "Contatti",
    ubicacion: "Posizione",
    redesSociales: "Social Media",
  },
  de: {
    contacto: "Kontakt",
    ubicacion: "Standort",
    redesSociales: "Soziale Medien",
  },
}

function getTranslation(lang: Language) {
  return translations[lang] || translations.es
}

export function SiteFooter({ empresa }: SiteFooterProps) {
  const { language } = useLanguage()
  const currentYear = new Date().getFullYear()
  const t = getTranslation(language)

  if (!empresa) return null

  return (
    <footer className="w-full bg-foreground text-background/80 mt-12 border-t border-foreground/10">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* Columna 1: Redes Sociales */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-background uppercase tracking-wider">{t.redesSociales}</h3>
            <ul className="flex gap-4 pt-1">
              {empresa.instagram && (
                <li>
                  <a href={empresa.instagram} target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm" aria-label="Instagram">
                    <InstagramIcon className="w-5 h-5" />
                  </a>
                </li>
              )}
              {empresa.fb && (
                <li>
                  <a href={empresa.fb} target="_blank" rel="noopener noreferrer" className="text-background/70 hover:text-background transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-foreground rounded-sm" aria-label="Facebook">
                    <FacebookIcon className="w-5 h-5" />
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Columna 2: Contacto */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-background uppercase tracking-wider">{t.contacto}</h3>
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
              <h3 className="text-xs font-semibold text-background uppercase tracking-wider">{t.ubicacion}</h3>
              <div className="rounded-lg overflow-hidden border border-background/10 h-48 w-full">
                <iframe
                  title="Ubicación en Google Maps"
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
