-- Clave de idempotencia para la creación de pedidos.
--
-- PROBLEMA QUE RESUELVE
-- `POST /api/pedidos` no es idempotente: cada llamada crea una comanda nueva.
-- En el comedor la red mala no es "sin red", es red DEGRADADA — WiFi asociado
-- sin salida, 4G a una raya. Ahí `fetch()` no falla rápido: se queda colgado.
-- El comensal ve el spinner, se cansa, y vuelve a pulsar "Hacer pedido". Si la
-- primera petición sí había llegado al servidor, la cocina recibe el pedido
-- DOS VECES. Es la misma causa raíz que motivó el timeout del NetworkFirst del
-- service worker, vista desde el otro lado.
--
-- Sin esta clave tampoco se puede reintentar automáticamente: por eso los
-- pedidos quedaron excluidos de la cola offline del camarero
-- (src/lib/waiter/command-queue.ts). Reintentar sin idempotencia convierte una
-- comanda perdida en una comanda duplicada, que es el problema peor.
--
-- POR QUÉ ADEMÁS UNA HUELLA DEL PAYLOAD
-- Al reproducir una clave ya usada, el servidor devuelve la respuesta original
-- — y esa respuesta incluye el `tracking_token`, que es una credencial al
-- portador: con él se consulta el estado del pedido. Si bastara con acertar la
-- clave, adivinarla sería una vía para cosechar tokens de otros comensales.
-- Exigir que la huella del cuerpo coincida cierra esa vía: quien no conoce el
-- pedido exacto no puede reproducirlo. Si la clave coincide pero la huella no,
-- la API responde 409 (semántica estándar de Idempotency-Key, RFC draft).
--
-- POR QUÉ TEXT Y NO UUID
-- Un envío de mesa con varios pases genera una comanda por pase. Todas
-- comparten el mismo intento del usuario, así que la clave se namespacia:
-- `<uuid>:primer`, `<uuid>:segundo`. El formato lo valida la API.
--
-- POR QUÉ NO HAY TRIGGER DE INMUTABILIDAD (a diferencia de es_prueba)
-- Sería un BEFORE UPDATE sobre `pedidos`, la tabla más caliente del sistema:
-- cada cambio de estado de cocina/bar pasa por ahí y se propaga por Realtime.
-- Pagar un trigger por fila en esa ruta para proteger una columna que solo
-- escribe service_role en el INSERT no sale a cuenta. El control real es el
-- índice único: aunque alguien reescribiera la clave, no podría colisionar.

-- ── 1. Columnas ──────────────────────────────────────────────────────────────
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

COMMENT ON COLUMN public.pedidos.idempotency_key IS
  'Clave de reintento elegida por el cliente, única por empresa. Permite que reenviar '
  'el mismo pedido devuelva el original en vez de crear un duplicado. La fija la API '
  'desde la cabecera Idempotency-Key; nunca desde el cuerpo de la petición.';

COMMENT ON COLUMN public.pedidos.idempotency_fingerprint IS
  'SHA-256 del contenido del pedido en el momento de crearlo. Al reproducir una clave '
  'se compara con la huella entrante: si difiere, la API responde 409 en vez de '
  'devolver el tracking_token de un pedido ajeno.';

-- ── 2. El control: unicidad por empresa ──────────────────────────────────────
-- Parcial, porque la inmensa mayoría de filas históricas (y toda comanda creada
-- desde TPV o desde los tests) no lleva clave. Indexar solo las que la tienen.
--
-- Es este índice, y no la comprobación previa en la API, lo que garantiza la
-- unicidad. La comprobación previa resuelve el caso normal — el usuario que
-- pulsa dos veces con segundos de diferencia — pero deja una ventana de carrera
-- cuando los dos envíos llegan a la vez. Ahí el segundo INSERT choca con este
-- índice (SQLSTATE 23505) y la API lo trata como reproducción, no como error.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_idempotency_key
  ON public.pedidos (empresa_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
