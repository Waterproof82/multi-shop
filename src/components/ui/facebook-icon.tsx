/**
 * Marca de Facebook, en local.
 *
 * POR QUÉ NO SE USA `Facebook` DE lucide-react
 * lucide deprecó todos sus iconos de marca y los va a ELIMINAR en la v1.0
 * (lucide-icons/lucide#670). Es decir: esto no es un aviso cosmético, es un
 * `npm update` futuro que rompe el build de golpe en los dos sitios donde se
 * usa. Traerlo aquí quita esa bomba de relojería sin añadir una dependencia
 * nueva solo para un icono.
 *
 * El trazado es el de Simple Icons (CC0), que es justo lo que recomienda el
 * propio aviso de deprecación de lucide.
 *
 * `currentColor` a propósito: los dos usos lo colorean por clase heredada
 * (`text-footer-fg/85`, y el color de la etiqueta en el formulario de admin),
 * igual que hacía el icono de lucide.
 */
export function FacebookIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}
