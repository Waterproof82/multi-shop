/**
 * Marca de WhatsApp, en local (mismo motivo que `FacebookIcon`: lucide deprecó
 * sus iconos de marca). Trazado de Simple Icons (CC0). `currentColor` para que
 * lo coloree la clase heredada.
 */
export function WhatsAppIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-1 1.1-.2.2-.4.2-.6.1-.7-.3-1.5-.7-2.2-1.4-.6-.5-1-1.2-1.4-1.9-.1-.3 0-.4.1-.6l.5-.5c.1-.1.2-.3.2-.4.1-.2 0-.3 0-.4 0-.1-.6-1.5-.9-2.1-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.2-.8.4-.3.3-1.1 1-1.1 2.4 0 1.4 1 2.7 1.2 2.9.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.2-.2-.5-.3z" />
      <path d="M20.5 3.5C18.3 1.2 15.3 0 12.1 0 5.5 0 .1 5.4.1 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6c1.7.9 3.7 1.4 5.7 1.4 6.6 0 12-5.4 12-12 .1-3.2-1.2-6.2-3.4-8.3zM12.1 21.8c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.5-1.5-5.4 0-5.5 4.5-9.9 9.9-9.9 2.7 0 5.1 1 7 2.9 1.9 1.9 2.9 4.4 2.9 7 0 5.5-4.4 10-9.9 10z" />
    </svg>
  );
}
