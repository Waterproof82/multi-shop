-- Histórico de slugs de producto (product-detail-pages PR5): cuando un admin
-- renombra el slug de un producto de tienda, el slug ANTIGUO queda guardado
-- aquí apuntando al producto, para poder devolver un redirect permanente
-- (308, Next `permanentRedirect`) en vez de un 404 silencioso.
--
-- Diseño: (empresa_id, slug_antiguo) → producto_id, NUNCA slug → slug. Si
-- guardásemos "iba a X", una cadena de renombres A→B→C encadenaría
-- redirects (A→B, luego B→C) y un ciclo A→B→A podría looparse. Mapear
-- siempre al producto_id y resolver el slug VIVO en el momento de la
-- petición hace que cualquier lookup resuelva en UN SOLO salto.
--
-- Quién escribe: únicamente el trigger de abajo (AFTER UPDATE OF slug en
-- productos). Cubre los tres caminos de escritura de slug que existen hoy
-- (formulario admin, API REST, script de backfill) sin tener que acordarse
-- de llamarlo desde cada uno.
--
-- Rollback: una migración nueva con
-- `DROP TRIGGER IF EXISTS trg_productos_slug_historial ON public.productos;`
-- `DROP FUNCTION IF EXISTS private.registrar_slug_historico();`
-- `DROP TABLE IF EXISTS public.productos_slug_historial;`
-- (mismo patrón que 20260725000006_lc_drop_origen_offline_column.sql).

CREATE TABLE public.productos_slug_historial (
  empresa_id   UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  slug_antiguo TEXT NOT NULL
    CHECK (slug_antiguo ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug_antiguo) <= 64),
  producto_id  UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, slug_antiguo)
);

CREATE INDEX idx_productos_slug_historial_producto_id
  ON public.productos_slug_historial (producto_id);

ALTER TABLE public.productos_slug_historial ENABLE ROW LEVEL SECURITY;

-- Anon: denegado por completo. AS RESTRICTIVE se combina con AND, así que
-- ninguna policy permisiva añadida después puede anularla (mismo patrón que
-- empresa_legal / lc_create_next_partition).
CREATE POLICY "No direct anon access to productos_slug_historial"
  ON public.productos_slug_historial AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

-- Authenticated: solo lectura de SU empresa. La escritura es exclusiva del
-- trigger (SECURITY DEFINER, más abajo); ni el admin ni ninguna API deben
-- poder insertar/editar historial a mano.
CREATE POLICY "Admin ve su propio historial de slugs"
  ON public.productos_slug_historial FOR SELECT TO authenticated
  USING (empresa_id = (SELECT private.get_mi_empresa_id()));

REVOKE ALL ON public.productos_slug_historial FROM PUBLIC;
REVOKE ALL ON public.productos_slug_historial FROM anon;
GRANT ALL ON public.productos_slug_historial TO service_role;
GRANT SELECT ON public.productos_slug_historial TO authenticated;

-- Trigger: registra el slug saliente cada vez que cambia, y libera el
-- entrante si quedaba ocupado en el histórico (un slug VIVO siempre gana
-- sobre uno histórico — spec PR5 "live slug wins over history").
CREATE OR REPLACE FUNCTION private.registrar_slug_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- El slug nuevo deja de ser histórico de cualquier otro producto de la
  -- misma empresa: si existiera, es un slug reciclado (p. ej. A→B→A) y el
  -- valor vivo actual tiene que ganar.
  IF NEW.slug IS NOT NULL THEN
    DELETE FROM public.productos_slug_historial
     WHERE empresa_id = NEW.empresa_id
       AND slug_antiguo = NEW.slug;
  END IF;

  IF OLD.slug IS NOT NULL AND OLD.slug IS DISTINCT FROM NEW.slug THEN
    INSERT INTO public.productos_slug_historial (empresa_id, slug_antiguo, producto_id)
    VALUES (NEW.empresa_id, OLD.slug, NEW.id)
    ON CONFLICT (empresa_id, slug_antiguo)
    DO UPDATE SET producto_id = EXCLUDED.producto_id, created_at = now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.registrar_slug_historico() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.registrar_slug_historico() FROM anon;
REVOKE EXECUTE ON FUNCTION private.registrar_slug_historico() FROM authenticated;
GRANT  EXECUTE ON FUNCTION private.registrar_slug_historico() TO service_role;

DROP TRIGGER IF EXISTS trg_productos_slug_historial ON public.productos;
CREATE TRIGGER trg_productos_slug_historial
  AFTER UPDATE OF slug ON public.productos
  FOR EACH ROW
  WHEN (OLD.slug IS DISTINCT FROM NEW.slug)
  EXECUTE FUNCTION private.registrar_slug_historico();

COMMENT ON TRIGGER trg_productos_slug_historial ON public.productos
  IS 'product-detail-pages PR5 — registra el slug saliente en productos_slug_historial para servir un redirect 308 en vez de un 404.';
