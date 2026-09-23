-- Banner con modo slider: permite elegir entre imagen fija (actual) o hasta
-- 5 imágenes que rotan automáticamente en la página pública del menú.
-- No requiere RLS/GRANTs nuevos: son columnas sobre `empresas`, que ya tiene
-- su propio RLS y sus GRANTs a authenticated/anon.
ALTER TABLE public.empresas
  ADD COLUMN tipo_banner text NOT NULL DEFAULT 'imagen'
    CHECK (tipo_banner IN ('imagen', 'slider')),
  ADD COLUMN banner_slides jsonb NOT NULL DEFAULT '[]'::jsonb;
