-- Drop items_diferidos column from mesa_sesiones.
-- After this migration, deferred cart items are stored as real pedidos
-- with estado = 'retenido' instead of as JSONB in the session row.

ALTER TABLE public.mesa_sesiones DROP COLUMN IF EXISTS items_diferidos;
