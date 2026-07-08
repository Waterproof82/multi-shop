'use client';

export const dynamic = 'force-static';

export default function KitchenOfflinePage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center"
      style={{ background: 'oklch(13% 0.02 252)' }}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{ background: 'oklch(20% 0.04 252)' }}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(55% 0.08 252)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      <div>
        <h1
          className="text-xl font-semibold mb-2"
          style={{ color: 'oklch(92% 0.02 252)' }}
        >
          Sin conexión Wi-Fi
        </h1>
        <p
          className="text-sm max-w-xs"
          style={{ color: 'oklch(58% 0.05 252)' }}
        >
          La pantalla de cocina se reconectará automáticamente cuando vuelva la señal. Comprueba
          que el dispositivo está conectado a la red del local.
        </p>
      </div>

      <button
        type="button"
        onClick={() => globalThis.location.reload()}
        className="mt-2 px-5 py-2.5 rounded-lg text-sm font-medium"
        style={{
          background: 'oklch(28% 0.06 252)',
          color: 'oklch(85% 0.05 252)',
          border: '1px solid oklch(35% 0.05 252)',
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
