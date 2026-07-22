ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS alergenos text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.productos.alergenos IS
  'EU allergen codes per Regulation 1169/2011 Annex II. Valid values: gluten, crustaceans, eggs, fish, peanuts, soy, dairy, treenuts, celery, mustard, sesame, sulphites, lupin, molluscs';
