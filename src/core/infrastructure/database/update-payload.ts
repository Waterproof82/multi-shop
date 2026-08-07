/**
 * Construcción de payloads de UPDATE parcial.
 *
 * POR QUÉ EXISTE
 * Varios repositorios repetían la misma escalera de veinte y pico
 * `if (data.campo !== undefined) payload.campo = data.campo;`. Además de inflar
 * la complejidad, esa forma esconde la única decisión que de verdad importa:
 * cuál es el criterio para cada campo. Aquí el criterio es la lista.
 */

/**
 * Copia los campos presentes, tal cual.
 *
 * `undefined` significa "no lo toques": en una actualización parcial, lo que no
 * viene en el formulario no se puede borrar.
 *
 * Los valores viajan SIN convertir: `false` y `0` son datos legítimos. Convertir
 * lo falsy a NULL aquí haría que la columna volviera a su DEFAULT — es decir,
 * apagar un interruptor lo dejaría encendido.
 */
export function camposPresentes<T extends object>(
  data: T,
  campos: ReadonlyArray<keyof T & string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const campo of campos) {
    if (data[campo] !== undefined) payload[campo] = data[campo];
  }
  return payload;
}

/**
 * Copia los campos presentes convirtiendo la cadena vacía en NULL.
 *
 * Solo para campos de TEXTO. El formulario manda `''` cuando el usuario vacía
 * un campo, y guardar la cadena vacía deja `fb: ''` en vez de "sin Facebook",
 * que luego pinta un enlace roto en la web pública.
 *
 * Nunca usar con booleanos ni números: ver `camposPresentes`.
 */
export function camposTextoPresentes<T extends object>(
  data: T,
  campos: ReadonlyArray<keyof T & string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const campo of campos) {
    if (data[campo] !== undefined) payload[campo] = data[campo] || null;
  }
  return payload;
}
