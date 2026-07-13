'use client';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ reset }: Readonly<GlobalErrorProps>) {
  return (
    <html lang="es">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
          <div className="mb-4 text-4xl" role="img" aria-label="Error crítico">⚠️</div>
          <h1 className="mb-2 text-xl font-semibold text-gray-900">
            Error crítico
          </h1>
          <p className="mb-4 text-sm text-gray-600 max-w-md">
            La aplicación ha encontrado un error grave. Por favor, recargá la página.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
