-- Slug público y URL canónica externa para productos de tienda
-- (product-detail-pages PR1). Restaurantes no usan ninguna de las dos
-- columnas: se quedan en NULL y el índice único parcial las ignora.
--
-- El slug se genera en TypeScript (src/core/domain/productos/slug.ts), no en
-- SQL: `unaccent` no está instalado en este proyecto y una segunda
-- implementación en PL/pgSQL divergiría de la de TS tarde o temprano. El
-- CHECK de aquí es solo la última barrera si alguien escribe fuera de la API.
--
-- Rollback: si hace falta revertir, una migración nueva con
-- `DROP INDEX IF EXISTS productos_empresa_slug_key;` y
-- `ALTER TABLE public.productos DROP COLUMN IF EXISTS slug, DROP COLUMN IF EXISTS canonical_externo;`
-- (mismo patrón que 20260725000006_lc_drop_origen_offline_column.sql).

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS slug text NULL
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 64),
  ADD COLUMN IF NOT EXISTS canonical_externo text NULL
    CHECK (canonical_externo ~ '^https://' AND char_length(canonical_externo) <= 500);

-- Unicidad por tenant, no global: dos empresas pueden tener el mismo slug
-- (mismo criterio que el dominio público, que ya está scoped por empresa_id).
CREATE UNIQUE INDEX IF NOT EXISTS productos_empresa_slug_key
  ON public.productos (empresa_id, slug)
  WHERE slug IS NOT NULL;
