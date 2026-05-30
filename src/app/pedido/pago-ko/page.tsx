import type { Metadata } from 'next';
import Link from 'next/link';
import { XCircle } from 'lucide-react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PagoKoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <XCircle className="mx-auto h-16 w-16 text-destructive" />
        <h1 className="text-2xl font-bold">Pago no completado</h1>
        <p className="text-muted-foreground">
          No pudimos procesar tu pago. Podés intentarlo de nuevo.
        </p>
        <Link
          href="/"
          className="inline-block mt-2 px-6 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
