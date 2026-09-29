-- Copia del nombre de la modalidad de entrega (p. ej. el transportista) en el
-- pedido, igual que ya se copian el tipo y el precio.
--
-- Por qué copia y no JOIN: la FK pedidos.modalidad_entrega_id es
-- ON DELETE SET NULL. Si el admin borra o renombra la modalidad, un JOIN
-- perdería o cambiaría el transportista de pedidos ya enviados.
--
-- Columna nula en tabla existente: hereda RLS y GRANTs de `pedidos`.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS modalidad_entrega_nombre text
    CHECK (modalidad_entrega_nombre IS NULL OR char_length(modalidad_entrega_nombre) <= 200);

COMMENT ON COLUMN public.pedidos.modalidad_entrega_nombre IS
  'Nombre (es) de la modalidad de entrega en el momento del pedido. Copia, no referencia.';

-- Relleno de los pedidos ya existentes con el nombre actual de su modalidad.
-- Solo toca la columna nueva: no dispara triggers de estado/detalle/total.
UPDATE public.pedidos p
   SET modalidad_entrega_nombre = m.nombre_es
  FROM public.modalidades_entrega m
 WHERE m.id = p.modalidad_entrega_id
   AND p.modalidad_entrega_nombre IS NULL;
