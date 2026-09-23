-- Second product photo, only used by empresas tipo 'tienda'. Reuses the
-- existing foto_object_fit column for both images (same 480x480 WebP
-- pipeline, so a shared fit is enough — see
-- docs/superpowers/specs/2026-09-22-segunda-imagen-producto-design.md).

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS foto_url_2 text NULL;
