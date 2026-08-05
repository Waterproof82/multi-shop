/**
 * Nombres de canal de Realtime Broadcast.
 *
 * POR QUÉ ESTE MÓDULO EXISTE
 * En Broadcast, a diferencia de `postgres_changes`, **el nombre del canal ES la
 * clave de enrutado**: no hay `filter`, no hay RLS por fila. Quien se suscribe a
 * un topic recibe TODO lo que se publica en él. Por tanto el nombre no es una
 * etiqueta cosmética — es el límite de seguridad y el límite de tráfico a la vez.
 *
 * Tenerlo en un solo sitio no es manía de orden: el emisor (un trigger de
 * Postgres) y los cinco receptores están en repos mentales distintos, y si el
 * nombre se escribe a mano en cada uno, la primera errata deja al suscriptor
 * mudo SIN NINGÚN ERROR — se conecta, se queda esperando, y nadie se entera
 * hasta que un camarero dice "a mí no me salta nada".
 */

/**
 * Sesiones de mesa: apertura, pago en curso, sesión pagada, cierre.
 *
 * SCOPE POR EMPRESA — POR QUÉ
 * Este canal nació con nombre fijo y global. Como `realtime.send(..., FALSE)` lo
 * publica en abierto, cualquiera con la anon key —que viaja en el bundle de
 * todos los tenants, es pública por diseño— podía suscribirse y recibir EN VIVO
 * la actividad de mesas de todos los restaurantes de la plataforma: qué locales
 * operan, qué mesas, y cuándo empieza y termina cada cobro.
 *
 * No se filtraba PII, ni importes, ni el contenido de las comandas — solo UUIDs
 * y booleanos. Pero es telemetría de negocio de cada tenant, en tiempo real.
 *
 * Además era una factura de latencia: cada dispositivo se despertaba a
 * re-consultar por la actividad de empresas ajenas. El banner del camarero
 * lanzaba `fetchCounts()` porque en OTRO restaurante alguien cerró una mesa. En
 * un PDA con 4G eso es batería y datos regalados.
 *
 * QUÉ ES ESTO Y QUÉ NO ES
 * Esto es AISLAMIENTO, no autorización. Para suscribirse hay que conocer el
 * `empresaId`, que en el tenant propio es público. Un canal privado de verdad
 * (`realtime.send(..., TRUE)` + RLS sobre `realtime.messages`) exigiría que el
 * móvil del comensal llevara un token con claim de tenant, y hoy entra con la
 * anon key y sin sesión: dejaría a todos los comensales sin tiempo real. Ese es
 * otro trabajo. Este cierra el firehose global, que es el problema gordo.
 */
export function mesaSesionChannel(empresaId: string): string {
  return `mesa-sesion-update:${empresaId}`;
}
