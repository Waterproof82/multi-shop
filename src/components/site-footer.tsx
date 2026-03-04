"use client"

import { MapPin, Mail, Globe, MessageCircle } from "lucide-react"
import { useLanguage, type Language } from "@/lib/language-context"
import type { EmpresaInfo } from "@/lib/server-services"

interface SiteFooterProps {
  readonly empresa?: EmpresaInfo | null;
}

// Traducciones del footer
const translations = {
  es: {
    contacto: "Contacto",
    ubicacion: "Ubicación",
    verEnMapa: "Click para ver en Google Maps →",
    direccionNoConfigurada: "Dirección no configurada",
  },
  en: {
    contacto: "Contact",
    ubicacion: "Location",
    verEnMapa: "Click to see on Google Maps →",
    direccionNoConfigurada: "Address not configured",
  },
  fr: {
    contacto: "Contact",
    ubicacion: "Emplacement",
    verEnMapa: "Cliquez pour voir sur Google Maps →",
    direccionNoConfigurada: "Adresse non configurée",
  },
  it: {
    contacto: "Contatti",
    ubicacion: "Posizione",
    verEnMapa: "Clicca per vedere su Google Maps →",
    direccionNoConfigurada: "Indirizzo non configurato",
  },
  de: {
    contacto: "Kontakt",
    ubicacion: "Standort",
    verEnMapa: "Klicken Sie hier für Google Maps →",
    direccionNoConfigurada: "Adresse nicht konfiguriert",
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

  // Obtener descripción en el idioma actual o fallback a español
  const descripcion = empresa.descripcion?.[language as 'es' | 'en' | 'fr' | 'it' | 'de'] ?? empresa.descripcion?.es

  return (
    <footer className="w-full bg-black text-slate-200 mt-20 border-t border-slate-800" suppressHydrationWarning>
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          
          {/* Columna 1: Info Empresa */}
          <div className="space-y-4">
            {empresa.logoUrl ? (
              <img 
                src={empresa.logoUrl} 
                alt={empresa.nombre} 
                className="h-16 w-auto max-w-[200px] object-contain"
              />
            ) : (
              <h2 className="text-2xl font-bold text-white">{empresa.nombre}</h2>
            )}
            
            {descripcion && (
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
                {descripcion}
              </p>
            )}
            
            <div className="flex gap-4 pt-2">
                {empresa.instagram && (
                  <a href={empresa.instagram} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors" aria-label="Instagram">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
                  </a>
                )}
                {empresa.fb && (
                  <a href={empresa.fb} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white transition-colors" aria-label="Facebook">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                  </a>
                )}
            </div>
          </div>

          {/* Columna 2: Contacto y Dirección */}
          <div className="space-y-6">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{t.contacto}</h3>
            <ul className="space-y-4">
              {empresa.direccion && (
                <li className="flex items-start gap-3 group">
                  <MapPin className="w-5 h-5 text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                    {empresa.direccion}
                  </span>
                </li>
              )}
              {empresa.telefono && (
                <li className="flex items-center gap-3 group">
                  <MessageCircle className="w-5 h-5 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <a href={`https://wa.me/${empresa.telefono.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                    {empresa.telefono}
                  </a>
                </li>
              )}
              {empresa.emailNotification && (
                <li className="flex items-center gap-3 group">
                  <Mail className="w-5 h-5 text-amber-400 shrink-0 group-hover:scale-110 transition-transform" />
                  <a href={`mailto:${empresa.emailNotification}`} className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                    {empresa.emailNotification}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-3 group">
                <Globe className="w-5 h-5 text-indigo-400 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="text-sm text-slate-400">{empresa.dominio}</span>
              </li>
            </ul>
          </div>

          {/* Columna 3: Mapa */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">{t.ubicacion}</h3>
            {empresa.urlMapa && (
              <div className="rounded-xl overflow-hidden border border-slate-700 h-48 w-full bg-slate-800">
                <iframe
                  title="Ubicación"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={empresa.urlMapa}
                ></iframe>
              </div>
            )}
            {empresa.direccion && !empresa.urlMapa && (
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(empresa.direccion)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-slate-700 h-48 w-full group relative bg-slate-800 hover:border-slate-500 transition-colors"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                  <MapPin className="w-10 h-10 text-blue-400 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm">{empresa.direccion}</span>
                  <span className="text-xs text-blue-400 mt-2 group-hover:text-blue-300">{t.verEnMapa}</span>
                </div>
              </a>
            )}
            {!empresa.urlMapa && !empresa.direccion && (
              <div className="h-48 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 text-xs italic text-center p-4 border border-slate-700">
                <MapPin className="w-8 h-8 text-slate-600 mb-2 block mx-auto"/>
                {t.direccionNoConfigurada}
              </div>
            )}
          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>© {currentYear} {empresa.nombre}. Todos los derechos reservados.</p>
          <div className="flex items-center gap-6">
            <a 
                href="/admin/login" 
                className="hover:text-white transition-colors opacity-50 hover:opacity-100"
            >
                Admin
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
