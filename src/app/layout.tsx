import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "@/styles/globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { CartProvider } from "@/lib/cart-context";
import { LanguageProvider } from "@/lib/language-context";
import { PromoToast } from "@/components/promo-toast";
import { getEmpresaByDomain } from "@/lib/server-services";
import { getDomainFromHeaders } from "@/lib/domain-utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
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

  const faviconUrl = empresa?.logoUrl || '/favicon.ico';
  const mimeType = getMimeType(faviconUrl);
  const isDefaultFavicon = faviconUrl === '/favicon.ico';

  return {
    title: empresa?.nombre || "Mermelada de Tomate",
    description: empresa?.descripcion?.es?.substring(0, 160) || "Carta digital y pedidos",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${playfair.variable} font-serif`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <CartProvider>
              {/* Skip to main content link for accessibility */}
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                Saltar al contenido principal
              </a>
              <main id="main-content">
                {children}
              </main>
              <Toaster />
              <PromoToast />
            </CartProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
