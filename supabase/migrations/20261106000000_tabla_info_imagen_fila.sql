-- Campo de imagen por fila en `productos.tabla_info` (PR imagen-fila):
-- una fila pasa de `[{es,...},...]` (array plano de celdas) a
-- `{ celdas: [{es,...},...], imagen: <url|null> }`. Las filas existentes se
-- reacomodan manteniendo el orden y con `imagen: null`; la imagen sola la
-- sube el admin desde el formulario de producto. Las plantillas
-- (`tabla_plantillas.tabla_info`) solo guardan columnas: no llevan filas ni
-- imágenes, no requieren cambio.
--
-- Es UPDATE masivo de JSONB, seguro respecto a triggers de `productos`: el
-- único trigger AFTER UPDATE (`trg_productos_slug_historial`) es
-- `AFTER UPDATE OF slug`, no se dispara con esta migración.

UPDATE public.productos
SET tabla_info = jsonb_build_object(
  'columnas', tabla_info->'columnas',
  'filas', COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object('celdas', fila, 'imagen', NULL)
             ORDER BY ord
           )
    FROM jsonb_array_elements(tabla_info->'filas') WITH ORDINALITY AS f(fila, ord)
  ), '[]'::jsonb)
)
WHERE tabla_info IS NOT NULL
  AND jsonb_typeof(tabla_info->'filas') = 'array'
  AND jsonb_array_length(tabla_info->'filas') > 0
  AND jsonb_typeof(tabla_info->'filas'->0) = 'array';

COMMENT ON COLUMN public.productos.tabla_info IS
  'Tabla opcional de informacion del producto: { columnas: [{es,en?,fr?,it?,de?}], filas: [{ celdas: [{es,en?,fr?,it?,de?}], imagen: <url|null> }] }';
