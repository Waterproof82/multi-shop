'use client';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ reset }: Readonly<ErrorPageProps>) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
      <div className="mb-4 text-4xl" role="img" aria-label="Error">⚠️</div>
      <h2 className="mb-2 text-lg font-semibold text-destructive">
        Algo salió mal
      </h2>
      <p className="mb-4 text-sm text-muted-foreground max-w-md">
        Ha ocurrido un error inesperado. Por favor, intentá de nuevo o recargá la página.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
