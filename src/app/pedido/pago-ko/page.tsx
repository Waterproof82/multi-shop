import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { translations } from '@/lib/translations';
import type { Language } from '@/lib/language-context';
import { PaymentKoCleaner } from './PaymentKoCleaner';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ token?: string; lang?: string }>;
}

export default async function PagoKoPage({ searchParams }: Props) {
  const { token, lang } = await searchParams;
  const language: Language = (['es', 'en', 'fr', 'it', 'de'].includes(lang ?? '') ? lang : 'es') as Language;
  const tx = translations[language];

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {token && <PaymentKoCleaner token={token} />}
      <div className="max-w-sm w-full text-center space-y-4">
        <XCircle className="mx-auto h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">{tx.paymentKoTitle}</h1>
        <p className="text-muted-foreground">{tx.paymentKoMessage}</p>
        <Link
          href="/"
          className="inline-block mt-2 px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          {tx.trackingBackToHome}
        </Link>
      </div>
    </div>
  );
}
