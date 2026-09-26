"use client"

import { MapPin, Mail, Globe, Phone, Settings } from "lucide-react"
import { FacebookIcon } from "@/components/ui/facebook-icon"
import { InstagramIcon } from "@/components/ui/instagram-icon"
import { ImagenSubida } from "@/components/ui/imagen-subida"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { EmpresaPublic } from "@/core/domain/entities/types"

interface SiteFooterProps {
  readonly empresa?: EmpresaPublic | null;
  readonly hideMap?: boolean;
}

// Badge compartido por todas las empresas — subido una única vez a R2, no pasa por ImageUploader.
const GOOGLE_REVIEWS_BADGE_URL = `${process.env.NEXT_PUBLIC_R2_DOMAIN ?? ''}/shared/google-reviews-badge.png`;

function footerGridColsClass(columnasVisibles: number): string {
  if (columnasVisibles >= 4) return "lg:grid-cols-4";
  if (columnasVisibles === 3) return "lg:grid-cols-3";
  return "lg:grid-cols-2";
}

export function SiteFooter({ empresa, hideMap = false }: SiteFooterProps) {
  const { language } = useLanguage()
  const currentYear = new Date().getFullYear()

  if (!empresa) return null

  const mostrarMapa = Boolean(empresa.urlMapa) && !hideMap
  const mostrarResenas = Boolean(empresa.googleReviewsUrl)
  const columnasVisibles = 2 + (mostrarMapa ? 1 : 0) + (mostrarResenas ? 1 : 0)

  return (
    <footer className="w-full bg-footer-bg text-footer-fg mt-12 border-t border-footer-bg/10">
      <div className="max-w-[90rem] mx-auto px-6 py-10">
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${footerGridColsClass(columnasVisibles)} gap-10`}>

          {/* Columna 1: Redes Sociales */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-footer-fg uppercase tracking-wider">{t("socialMedia", language)}</h3>
            <ul className="flex gap-4 pt-1">
              {empresa.instagram && (
                <li>
                  <a href={empresa.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-footer-fg/85 hover:text-footer-fg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg rounded-sm"                   aria-label={`${t("instagram", language)} ${t("opensInNewTab", language)}`}>
                    <InstagramIcon className="w-5 h-5" />
                  </a>
                </li>
              )}
              {empresa.fb && (
                <li>
                  <a href={empresa.fb} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-footer-fg/85 hover:text-footer-fg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg rounded-sm"                   aria-label={`${t("facebook", language)} ${t("opensInNewTab", language)}`}>
                    <FacebookIcon className="w-5 h-5" />
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Columna 2: Contacto */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-footer-fg uppercase tracking-wider">{t("contact", language)}</h3>
            <ul className="space-y-3">
              {empresa.direccion && (
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-footer-fg/40 shrink-0 mt-0.5" />
                  <span className="text-sm text-footer-fg/85">{empresa.direccion}</span>
                </li>
              )}
              {empresa.telefono && (() => {
                const telefonoDigits = empresa.telefono.replaceAll(/\D/g, '');
                const telefonoDisplay = telefonoDigits.replace(/^(00|\+)?\d{1,3}(?=\d{9})/, '');
                return (
                <li className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-footer-fg/40 shrink-0" />
                  <a href={`tel:${telefonoDigits}`} className="text-sm text-footer-fg/85 hover:text-footer-fg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg rounded-sm">
                    {telefonoDisplay}
                  </a>
                </li>
                );
              })()}
              {empresa.emailNotification && (
                <li className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-footer-fg/40 shrink-0" />
                  <a href={`mailto:${empresa.emailNotification}`} className="text-sm text-footer-fg/85 hover:text-footer-fg transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg rounded-sm">
                    {empresa.emailNotification}
                  </a>
                </li>
              )}
              <li className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-footer-fg/40 shrink-0" />
                <span className="text-sm text-footer-fg/85">{empresa.dominio}</span>
              </li>
            </ul>
          </div>

          {/* Columna 3: Mapa */}
          {mostrarMapa && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-footer-fg uppercase tracking-wider">{t("location", language)}</h3>
              <div className="rounded-lg overflow-hidden border border-background/10 h-48 w-full">
                <iframe
                  title={t("locationIframe", language)}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  src={empresa.urlMapa ?? undefined}
                />
              </div>
            </div>
          )}

          {/* Columna 4: Google Reviews */}
          {mostrarResenas && (
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-footer-fg uppercase tracking-wider">{t("googleReviews", language)}</h3>
              <a
                href={empresa.googleReviewsUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-background/50 focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg"
                aria-label={`${t("googleReviews", language)} ${t("opensInNewTab", language)}`}
              >
                <ImagenSubida
                  src={GOOGLE_REVIEWS_BADGE_URL}
                  alt={t("googleReviews", language)}
                  width={180}
                  height={72}
                  className="object-contain"
                />
              </a>
            </div>
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-background/10 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-footer-fg/40">
          <p>© {currentYear} {empresa.nombre}</p>
          <a
            href="/admin/login"
            rel="nofollow"
            className="text-primary hover:text-primary/80 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-footer-bg rounded-sm"
            aria-label={t("admin", language)}
          >
            <Settings className="w-4 h-4" />
          </a>
        </div>
      </div>
    </footer>
  )
}
