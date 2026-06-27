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
import { ExitConfirmation } from "@/components/exit-confirmation";
import { SwRegistrar } from "@/components/sw-registrar";
import { getEmpresaByDomain } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";
import type { EmpresaPublic } from "@/core/domain/entities/types";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

// Multi-language fallback descriptions for SEO
const FALLBACK_DESCRIPTIONS: Record<string, string> = {
  es: "Carta digital y pedidos - Consulta nuestro menú online, pide a domicilio o para recoger",
  en: "Digital menu and online ordering - Browse our menu, order for delivery or pickup",
  fr: "Menu numérique et commandes en ligne - Consultez notre menu, commandez pour livraison",
  it: "Menu digitale e ordini online - Consulta il nostro menu, ordina per consegna",
  de: "Digitales Menü und Online-Bestellung - Durchsuchen Sie unser Menü, bestellen Sie",
};

const LOCALE_MAP: Record<string, string> = {
  es: "es_ES", en: "en_US", fr: "fr_FR", it: "it_IT", de: "de_DE",
};

type LangKey = "es" | "en" | "fr" | "it" | "de";
const LANG_KEYS: LangKey[] = ["es", "en", "fr", "it", "de"];

function getPrimaryLang(empresa: EmpresaPublic | null): LangKey {
  if (!empresa?.descripcion) return "es";
  for (const lang of LANG_KEYS) {
    if (empresa.descripcion[lang]) return lang;
  }
  return "es";
}

function getAvailableLangs(empresa: EmpresaPublic | null): LangKey[] {
  if (!empresa?.descripcion) return ["es"];
  const available = LANG_KEYS.filter(l => empresa.descripcion?.[l]);
  return available.length > 0 ? available : ["es"];
}

function getDescriptionForLang(empresa: EmpresaPublic | null, lang: LangKey): string {
  return empresa?.descripcion?.[lang]?.substring(0, 160)
    ?? FALLBACK_DESCRIPTIONS[lang]
    ?? FALLBACK_DESCRIPTIONS.es;
}

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
  const availableLangs = getAvailableLangs(empresa);

  const description = getDescriptionForLang(empresa, primaryLang);

  const ogImage = empresa?.urlImage || empresa?.logoUrl || undefined;
  const primaryLocale = LOCALE_MAP[primaryLang] ?? "es_ES";
  const alternateLocales = availableLangs
    .filter(l => l !== primaryLang)
    .map(l => LOCALE_MAP[l])
    .filter(Boolean) as string[];

  const hreflangMap: Record<string, string> = { [primaryLang]: "/" };
  for (const lang of availableLangs) {
    if (lang !== primaryLang) hreflangMap[lang] = `/?lang=${lang}`;
  }

  return {
    title,
    description,
    metadataBase: new URL(baseUrl),
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large" as const,
      "max-snippet": -1,
    },
    alternates: {
      canonical: "/",
      languages: hreflangMap,
    },
    openGraph: {
      title,
      description,
      url: baseUrl,
      siteName: title,
      type: "website",
      locale: primaryLocale,
      alternateLocale: alternateLocales,
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630, alt: title }] } : {}),
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
                  Saltar al contenido principal
                </a>
                <Suspense>
                  <WaiterBanner />
                </Suspense>
                <main id="main-content">
                  {children}
                </main>
                <Toaster />
                <LazyPromoToast />
                <LazyTgtgReservaPopup />
              </CartProvider>
            </LanguageProvider>
          </ErrorBoundary>
        </ThemeProvider>
        <SwRegistrar />
      </body>
    </html>
  );
}
