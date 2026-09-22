-- Tabla de informacion configurable por producto (columnas + filas, texto
-- traducible por celda). Columna JSONB nullable en una tabla existente: no
-- requiere RLS/GRANTs nuevos, hereda los de `productos`.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS tabla_info jsonb NULL DEFAULT NULL;

COMMENT ON COLUMN public.productos.tabla_info IS
  'Tabla opcional de informacion del producto: { columnas: [{es,en?,fr?,it?,de?}], filas: [[{es,en?,fr?,it?,de?}]] }';
