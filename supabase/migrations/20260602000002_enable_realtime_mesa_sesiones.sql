-- Enable Realtime on mesa_sesiones so clients receive immediate pago_en_curso changes.
-- REPLICA IDENTITY FULL is required to allow filtering by non-PK columns (mesa_id).
ALTER TABLE public.mesa_sesiones REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mesa_sesiones;
