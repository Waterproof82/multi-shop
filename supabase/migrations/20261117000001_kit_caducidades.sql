-- kit-expiry-reminders M1 (sdd en el repo kitemergenciacanarias,
-- docs/sdd/kit-expiry-reminders/): lotes de kits con la fecha REAL de
-- caducidad de cada consumible, números de serie de los kits (etiqueta con
-- QR en la cremallera), registro opcional de avisos y avisos enviados.
--
-- Decisiones del propietario (2026-11-17):
--   D2  caducidad = fecha impresa del lote, nunca una vida útil estimada.
--   D5  el botiquín se repone POR PARTES: una fila por parte (`parte`).
--   D7  el power bank no es un consumible: nunca lleva fila aquí.
--
-- Reutiliza el modelo existente (revisión del propietario, 2026-11-17): el
-- kit es un `productos`, cada consumible un `ingredientes` y la fecha sale
-- de la línea del albarán de compra, sin volver a teclearla.
--
-- Acceso: todas las tablas niegan anon (RESTRICTIVE). La página pública del
-- QR y el cron van por service_role a través de casos de uso; el admin del
-- tenant gestiona lotes y ve los registros de su empresa.
--
-- ROLLBACK:
--   DROP VIEW public.kit_lote_caducidades_efectivas;
--   DROP TABLE public.kit_avisos_enviados, public.kits_registrados,
--     public.kit_lote_caducidades, public.kit_lotes, public.kit_avisos_config;
--   DROP FUNCTION private.kit_caducidades_validar_empresa();

-- ── Lotes ──────────────────────────────────────────────────────────────────
-- Reutiliza el modelo existente: el kit es un `productos` (no un slug suelto)
-- y cada consumible es un `ingredientes`, el mismo que usan las recetas.
CREATE TABLE public.kit_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  codigo TEXT NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 64),
  fecha_montaje DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo),
  -- Destino de las FK compuestas: una fila hija nunca cuelga de un lote de
  -- otra empresa, aunque un admin conozca su id.
  UNIQUE (id, empresa_id)
);
CREATE INDEX idx_kit_lotes_producto ON public.kit_lotes(producto_id);

-- Una fila por consumible del lote; el botiquín, una por parte (D5).
-- La fecha tiene UNA sola fuente:
--   · la línea del albarán de compra (`albaranes_compra_items.fecha_caducidad`,
--     ya registrada al recibir la mercancía), o
--   · `caduca_el`, solo cuando el albarán no la recoge (las partes del
--     botiquín: el albarán trae el botiquín entero).
CREATE TABLE public.kit_lote_caducidades (
  lote_id UUID NOT NULL,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ingrediente_id UUID NOT NULL REFERENCES public.ingredientes(id) ON DELETE RESTRICT,
  parte TEXT NOT NULL DEFAULT '' CHECK (char_length(parte) <= 120),
  albaran_compra_item_id UUID NULL REFERENCES public.albaranes_compra_items(id) ON DELETE RESTRICT,
  caduca_el DATE NULL,
  CONSTRAINT kit_lote_caducidades_una_fuente CHECK ((albaran_compra_item_id IS NULL) <> (caduca_el IS NULL)),
  PRIMARY KEY (lote_id, ingrediente_id, parte),
  FOREIGN KEY (lote_id, empresa_id) REFERENCES public.kit_lotes(id, empresa_id) ON DELETE CASCADE
);
CREATE INDEX idx_kit_lote_caducidades_ingrediente ON public.kit_lote_caducidades(ingrediente_id);
CREATE INDEX idx_kit_lote_caducidades_albaran_item ON public.kit_lote_caducidades(albaran_compra_item_id);

-- productos, ingredientes y albaranes no tienen UNIQUE (id, empresa_id), y
-- albaranes_compra_items ni siquiera lleva empresa_id: la pertenencia a la
-- empresa se comprueba aquí. SECURITY DEFINER para que el resultado no
-- dependa de los grants por columna; solo responde sobre NEW.empresa_id, que
-- la RLS ya limita a la del admin.
CREATE FUNCTION private.kit_caducidades_validar_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'kit_lotes' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.productos p
      WHERE p.id = NEW.producto_id AND p.empresa_id = NEW.empresa_id
    ) THEN
      RAISE EXCEPTION 'kit_lotes: el producto no es de esta empresa' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ingredientes i
    WHERE i.id = NEW.ingrediente_id AND i.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'kit_lote_caducidades: el ingrediente no es de esta empresa' USING ERRCODE = '23503';
  END IF;

  IF NEW.albaran_compra_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.albaranes_compra_items aci
    JOIN public.albaranes_compra ac ON ac.id = aci.albaran_compra_id
    JOIN public.catalogo_compra cc ON cc.id = aci.catalogo_compra_id
    WHERE aci.id = NEW.albaran_compra_item_id
      AND ac.empresa_id = NEW.empresa_id
      AND cc.ingrediente_id = NEW.ingrediente_id
      AND aci.fecha_caducidad IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'kit_lote_caducidades: la línea de albarán no es de este ingrediente y empresa, o no tiene fecha de caducidad'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.kit_caducidades_validar_empresa() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER kit_lotes_validar_empresa
  BEFORE INSERT OR UPDATE ON public.kit_lotes
  FOR EACH ROW EXECUTE FUNCTION private.kit_caducidades_validar_empresa();
CREATE TRIGGER kit_lote_caducidades_validar_empresa
  BEFORE INSERT OR UPDATE ON public.kit_lote_caducidades
  FOR EACH ROW EXECUTE FUNCTION private.kit_caducidades_validar_empresa();

-- ── Kits (una fila por serie impresa) ─────────────────────────────────────
-- email NULL = serie impresa pero sin registrar. Los consentimientos solo
-- pueden existir con email, y se guarda la versión del texto aceptado.
CREATE TABLE public.kits_registrados (
  serie TEXT PRIMARY KEY CHECK (serie ~ '^KEC-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$'),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL,
  pedido_id UUID NULL REFERENCES public.pedidos(id) ON DELETE SET NULL,
  email TEXT NULL CHECK (email IS NULL OR char_length(email) <= 254),
  telefono TEXT NULL CHECK (telefono IS NULL OR char_length(telefono) <= 20),
  consiente_email_at TIMESTAMPTZ NULL,
  consiente_whatsapp_at TIMESTAMPTZ NULL,
  texto_consentimiento_version TEXT NULL CHECK (char_length(texto_consentimiento_version) <= 32),
  baja_token TEXT UNIQUE NULL,
  registrado_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kits_registrados_consentimiento_con_email CHECK (
    email IS NOT NULL OR (consiente_email_at IS NULL AND consiente_whatsapp_at IS NULL AND telefono IS NULL)
  ),
  CONSTRAINT kits_registrados_whatsapp_con_telefono CHECK (
    consiente_whatsapp_at IS NULL OR telefono IS NOT NULL
  ),
  UNIQUE (serie, empresa_id),
  FOREIGN KEY (lote_id, empresa_id) REFERENCES public.kit_lotes(id, empresa_id) ON DELETE RESTRICT
);

CREATE INDEX idx_kits_registrados_empresa ON public.kits_registrados(empresa_id);
CREATE INDEX idx_kits_registrados_lote ON public.kits_registrados(lote_id);
CREATE INDEX idx_kits_registrados_avisos ON public.kits_registrados(empresa_id)
  WHERE consiente_email_at IS NOT NULL;

-- ── Avisos enviados (idempotencia: nunca dos veces el mismo aviso) ────────
CREATE TABLE public.kit_avisos_enviados (
  serie TEXT NOT NULL,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ingrediente_id UUID NOT NULL REFERENCES public.ingredientes(id) ON DELETE RESTRICT,
  parte TEXT NOT NULL DEFAULT '',
  umbral_dias SMALLINT NOT NULL CHECK (umbral_dias IN (30, 15)),
  canal TEXT NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  enviado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (serie, ingrediente_id, parte, umbral_dias, canal),
  FOREIGN KEY (serie, empresa_id) REFERENCES public.kits_registrados(serie, empresa_id) ON DELETE CASCADE
);

CREATE INDEX idx_kit_avisos_enviados_ingrediente ON public.kit_avisos_enviados(ingrediente_id);

-- ── Interruptor: pausar avisos durante una emergencia activa ──────────────
CREATE TABLE public.kit_avisos_config (
  empresa_id UUID PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  avisos_pausados BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RLS + GRANTs (checklist de CLAUDE.md, mismo patrón que menus_virtuales)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'kit_lotes', 'kit_lote_caducidades', 'kits_registrados',
    'kit_avisos_enviados', 'kit_avisos_config'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)',
      'No direct anon access to ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (empresa_id = (SELECT private.get_mi_empresa_id()))',
      'Admin ve ' || t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;

  -- El admin gestiona lotes, fechas, series y el interruptor. Los avisos
  -- enviados solo los escribe el cron (service_role).
  FOREACH t IN ARRAY ARRAY[
    'kit_lotes', 'kit_lote_caducidades', 'kits_registrados', 'kit_avisos_config'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id = (SELECT private.get_mi_empresa_id()))',
      'Admin inserta ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (empresa_id = (SELECT private.get_mi_empresa_id())) WITH CHECK (empresa_id = (SELECT private.get_mi_empresa_id()))',
      'Admin edita ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (empresa_id = (SELECT private.get_mi_empresa_id()))',
      'Admin elimina ' || t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;

  EXECUTE 'GRANT SELECT ON public.kit_avisos_enviados TO authenticated';
END $$;

-- ── Fecha efectiva de cada consumible del lote ────────────────────────────
-- Lo que leen la página del QR y el cron. security_invoker: respeta la RLS
-- de quien consulta. Si alguien borra la fecha de la línea del albarán, la
-- fila desaparece de aquí (el kit pasa a «sin datos» para ese consumible).
CREATE VIEW public.kit_lote_caducidades_efectivas
WITH (security_invoker = true) AS
SELECT
  c.lote_id,
  c.empresa_id,
  c.ingrediente_id,
  i.nombre AS consumible,
  c.parte,
  COALESCE(c.caduca_el, aci.fecha_caducidad) AS caduca_el
FROM public.kit_lote_caducidades c
JOIN public.ingredientes i ON i.id = c.ingrediente_id
LEFT JOIN public.albaranes_compra_items aci ON aci.id = c.albaran_compra_item_id
WHERE COALESCE(c.caduca_el, aci.fecha_caducidad) IS NOT NULL;

REVOKE ALL ON public.kit_lote_caducidades_efectivas FROM anon;
GRANT SELECT ON public.kit_lote_caducidades_efectivas TO authenticated, service_role;
