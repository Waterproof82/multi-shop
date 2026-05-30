import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CheckCircle } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
        <h1 className="text-2xl font-bold">¡Pago confirmado!</h1>
        <p className="text-muted-foreground">
          Tu pedido fue recibido y estamos buscando un repartidor.
        </p>
      </div>
    </div>
  );
}
