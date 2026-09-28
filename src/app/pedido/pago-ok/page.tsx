import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PagoOkContent } from './pago-ok-content';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function PagoOkPage({ searchParams }: Props) {
  const { token } = await searchParams;

  // If we have the tracking token, redirect straight to the tracking page
  if (token) {
    redirect(`/tracking/${token}`);
  }

  // Fallback: show confirmation without tracking link
  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-background px-4">
      <PagoOkContent />
    </main>
  );
}
