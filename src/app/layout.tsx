import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { LazyPromoToast, LazyTgtgReservaPopup } from "@/components/lazy-client-components";
import { WaiterBanner } from "@/components/waiter-banner";
import { debeMontarseWaiterBanner } from "@/lib/waiter/banner-visibilidad";
import { ExitConfirmation } from "@/components/exit-confirmation";
import { SwRegistrar } from "@/components/sw-registrar";
import { getEmpresaByDomain } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import { getDescriptionForLang, getPrimaryLang, LOCALE_MAP } from "@/lib/seo/tenant-seo";
import { t } from "@/lib/translations";
import * as Sentry from '@sentry/nextjs';
import { SentryProvider } from '@/components/sentry-provider';
import { AnaliticaVercel } from '@/components/analitica-vercel';

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

function getMimeType(url: string): string {
  if (!url || url === '/favicon.ico') return 'image/x-icon';
  if (url.endsWith('.png')) return 'image/png';
  if (url.endsWith('.jpg') || url.endsWith('.jpeg')) return 'image/jpeg';
  if (url.endsWith('.svg')) return 'image/svg+xml';
  return 'image/webp';
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;
  const baseUrl = domain ? `https://${domain}` : "https://localhost:3000";

  const faviconUrl = empresa?.logoUrl || '/favicon.ico';
  const mimeType = getMimeType(faviconUrl);
  const isDefaultFavicon = faviconUrl === '/favicon.ico';

  const title = empresa?.nombre || "Mermelada de Tomate";
  const primaryLang = getPrimaryLang(empresa);
  const description = getDescriptionForLang(empresa, primaryLang);
  const ogImage = empresa?.urlImage || empresa?.logoUrl || undefined;

  // Valores POR DEFECTO para todo el arbol. Sin `alternates` a proposito: el
  // canonical y el hreflang los declara cada pagina indexable (ver
  // src/lib/seo/tenant-seo.ts). Uno aqui se heredaria en /carta, /privacidad...
  // apuntando todos a "/".
  return {
    title: { default: title, template: `%s | ${title}` },
    description,
    applicationName: title,
    metadataBase: new URL(baseUrl),
    formatDetection: { telephone: false, email: false, address: false },
    // Dominio sin empresa: pagina de error, no debe indexarse.
    robots: empresa
      ? { index: true, follow: true, "max-image-preview": "large" as const, "max-snippet": -1 }
      : { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: title,
      type: "website",
      locale: LOCALE_MAP[primaryLang],
      ...(ogImage ? { images: [{ url: ogImage, alt: title }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    icons: isDefaultFavicon
      ? { icon: [{ url: '/favicon.ico', type: 'image/x-icon' }] }
      : {
          icon: [
            { url: faviconUrl, type: mimeType, sizes: '32x32' },
            { url: faviconUrl, type: mimeType, sizes: '16x16' },
          ],
          apple: [{ url: faviconUrl, type: mimeType, sizes: '180x180' }],
          other: [
            { url: faviconUrl, type: mimeType, sizes: '192x192', rel: 'android-chrome' },
            { url: faviconUrl, type: mimeType, sizes: '512x512', rel: 'android-chrome' },
          ],
        },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const domain = await getDomainFromHeaders();
  const empresa = domain ? await getEmpresaByDomain(domain) : null;
  // Set tenant tag on the Sentry server scope for this request.
  // AsyncLocalStorage propagates this tag to all errors thrown in this render tree.
  if (empresa?.id) {
    Sentry.setTag('empresa_id', empresa.id);
  }
  const lang = getPrimaryLang(empresa);
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} font-sans`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <ErrorBoundary>
            <LanguageProvider>
              <CartProvider>
                <ExitConfirmation />
                {/* Skip to main content link for accessibility */}
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {t("skipToContent", lang)}
                </a>
                {debeMontarseWaiterBanner(empresa?.tipo) && (
                  <Suspense>
                    <WaiterBanner />
                  </Suspense>
                )}
                {/* Sin main aqui: cada pagina/layout pone el suyo
                    (main#main-content). Envolver todo en un main
                    metia el header/footer de la landing y la carta
                    DENTRO de main —dejaban de ser landmarks banner/
                    contentinfo— y anidaba el main de admin, superadmin,
                    TPV y tracking dentro de otro. */}
                {children}
                <Toaster />
                <LazyPromoToast />
                <LazyTgtgReservaPopup />
              </CartProvider>
            </LanguageProvider>
          </ErrorBoundary>
        </ThemeProvider>
        <SwRegistrar />
        <SentryProvider empresaId={empresa?.id ?? null} />
        <AnaliticaVercel />
      </body>
    </html>
  );
}
