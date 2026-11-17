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
-- Acceso: todas las tablas niegan anon (RESTRICTIVE). La página pública del
-- QR y el cron van por service_role a través de casos de uso; el admin del
-- tenant gestiona lotes y ve los registros de su empresa.
--
-- ROLLBACK:
--   DROP TABLE public.kit_avisos_enviados, public.kits_registrados,
--     public.kit_lote_caducidades, public.kit_lotes, public.kit_avisos_config;

-- ── Lotes ──────────────────────────────────────────────────────────────────
CREATE TABLE public.kit_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 64),
  kit_slug TEXT NOT NULL CHECK (kit_slug ~ '^[a-z0-9-]{1,64}$'),
  fecha_montaje DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo),
  -- Destino de las FK compuestas: una fila hija nunca cuelga de un lote de
  -- otra empresa, aunque un admin conozca su id.
  UNIQUE (id, empresa_id)
);

-- Una fila por consumible del lote; el botiquín, una por parte (D5).
-- `consumible` = nombre de fila del inventario, idéntico en la web.
CREATE TABLE public.kit_lote_caducidades (
  lote_id UUID NOT NULL,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  consumible TEXT NOT NULL CHECK (char_length(consumible) BETWEEN 1 AND 200),
  parte TEXT NOT NULL DEFAULT '' CHECK (char_length(parte) <= 120),
  caduca_el DATE NOT NULL,
  PRIMARY KEY (lote_id, consumible, parte),
  FOREIGN KEY (lote_id, empresa_id) REFERENCES public.kit_lotes(id, empresa_id) ON DELETE CASCADE
);

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
  consumible TEXT NOT NULL,
  parte TEXT NOT NULL DEFAULT '',
  umbral_dias SMALLINT NOT NULL CHECK (umbral_dias IN (30, 15)),
  canal TEXT NOT NULL CHECK (canal IN ('email', 'whatsapp')),
  enviado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (serie, consumible, parte, umbral_dias, canal),
  FOREIGN KEY (serie, empresa_id) REFERENCES public.kits_registrados(serie, empresa_id) ON DELETE CASCADE
);

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
