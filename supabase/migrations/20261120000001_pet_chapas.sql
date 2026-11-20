-- pet-id-qr-profile PR1 (sdd en el repo kitemergenciacanarias,
-- docs/sdd/pet-id-qr-profile/): chapas QR para mascotas con perfil público,
-- alta por doble opt-in, gestión por magic link y relay de contacto.
-- Solo la migración: el código (PR2+) llega con las flags
-- PET_PERFIL_PUBLICO_LIVE/PET_ALTA_LIVE en false, así que esta migración es
-- aditiva e inerte hasta entonces.
--
-- Decisiones de design.md:
--   DD1  dos repositorios (admin / público) porque el acceso es muy
--        distinto: el admin nunca ve PII.
--   DD6  el alta solo recoge email, nombre y especie; la foto y el teléfono
--        se añaden desde la gestión, con la chapa ya confirmada.
--   DD7  en `pet_chapas`, `authenticated` NO tiene ningún GRANT ni policy
--        (solo `service_role`): más estricto que `kits_registrados`, porque
--        aquí el admin no necesita ver ni leer directamente los datos del
--        dueño, solo recuentos vía casos de uso.
--   DD16 `confirmado_at` guarda la última confirmación (alta o edición desde
--        la gestión); el plazo de conservación se cuenta desde ahí.
--
-- Estados sin columna extra (R-QR.3.1): libre = sin email; pendiente = con
-- email, sin confirmar; activa = confirmada. Los CHECK de abajo blindan esta
-- máquina de estados en la propia tabla.
--
-- Acceso: las dos tablas niegan `anon` (RESTRICTIVE). `pet_chapa_lotes` la
-- gestiona el admin del tenant (authenticated, por empresa_id). `pet_chapas`
-- solo la tocan los casos de uso vía `service_role` (DD7): el perfil público,
-- el alta, la gestión y el relay no pasan nunca por una sesión autenticada.
--
-- ROLLBACK (solo sin perfiles activos, ver design.md "Migración y despliegue"):
--   DROP TABLE public.pet_chapas, public.pet_chapa_lotes;
--   DROP FUNCTION private.pet_chapa_lotes_validar_producto();
--   ALTER TABLE public.empresas DROP COLUMN pet_id_qr_habilitado;

-- ── Lotes ──────────────────────────────────────────────────────────────────
CREATE TABLE public.pet_chapa_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  codigo TEXT NOT NULL CHECK (char_length(codigo) BETWEEN 1 AND 64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo),
  -- Destino de la FK compuesta de `pet_chapas`: una chapa nunca cuelga de un
  -- lote de otra empresa, aunque un admin conozca su id.
  UNIQUE (id, empresa_id)
);

-- productos no tiene UNIQUE (id, empresa_id): la pertenencia a la empresa se
-- comprueba aquí. SECURITY DEFINER para que el resultado no dependa de los
-- grants por columna de `productos`; solo responde sobre NEW.empresa_id, que
-- la RLS de abajo ya limita a la del admin.
CREATE FUNCTION private.pet_chapa_lotes_validar_producto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.productos p
    WHERE p.id = NEW.producto_id AND p.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'pet_chapa_lotes: el producto no es de esta empresa' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.pet_chapa_lotes_validar_producto() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER pet_chapa_lotes_validar_producto
  BEFORE INSERT OR UPDATE ON public.pet_chapa_lotes
  FOR EACH ROW EXECUTE FUNCTION private.pet_chapa_lotes_validar_producto();

-- ── Chapas (una fila por mascota) ─────────────────────────────────────────
-- Prefijo `M` (DD2): nunca colisiona con el prefijo `KEC` de kits_registrados.
CREATE TABLE public.pet_chapas (
  codigo TEXT PRIMARY KEY CHECK (codigo ~ '^M-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]$'),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL,
  email TEXT NULL CHECK (email IS NULL OR char_length(email) <= 254),
  idioma TEXT NULL CHECK (idioma IN ('es', 'en', 'fr', 'it', 'de')),
  gestion_token TEXT UNIQUE NULL,
  -- Marca también el inicio del pendiente: caduca a las 48 h (R-QR.12.4).
  consiente_perfil_at TIMESTAMPTZ NULL,
  texto_consentimiento_version TEXT NULL CHECK (char_length(texto_consentimiento_version) <= 32),
  -- Última confirmación: el plazo de conservación de 3 años se cuenta desde
  -- aquí (DD16, R-QR.12.1), no desde el alta original.
  confirmado_at TIMESTAMPTZ NULL,
  nombre TEXT NULL CHECK (char_length(nombre) BETWEEN 1 AND 40),
  especie TEXT NULL CHECK (especie IN ('perro', 'gato')),
  notas_salud TEXT NULL CHECK (char_length(notas_salud) <= 280),
  foto_clave TEXT NULL CHECK (foto_clave ~ '^mascotas/[0-9a-f-]{36}\.(webp|jpg)$'),
  telefono TEXT NULL CHECK (char_length(telefono) <= 20),
  telefono_consentido_at TIMESTAMPTZ NULL,
  telefono_texto_version TEXT NULL CHECK (char_length(telefono_texto_version) <= 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Libre (R-QR.3.1): sin email, ninguna otra columna de perfil puede tener dato.
  CONSTRAINT pet_chapas_libre_sin_datos CHECK (
    email IS NOT NULL OR num_nonnulls(
      idioma, gestion_token, consiente_perfil_at, texto_consentimiento_version,
      confirmado_at, nombre, especie, notas_salud, foto_clave,
      telefono, telefono_consentido_at, telefono_texto_version
    ) = 0
  ),
  -- Con email (pendiente o activa), el núcleo del alta siempre está completo.
  CONSTRAINT pet_chapas_alta_completa CHECK (
    email IS NULL OR num_nulls(
      idioma, gestion_token, consiente_perfil_at, texto_consentimiento_version,
      nombre, especie
    ) = 0
  ),
  -- El teléfono solo existe junto con su consentimiento versionado (R-QR.7.1).
  CONSTRAINT pet_chapas_telefono_consentido CHECK (
    (telefono IS NULL) = (telefono_consentido_at IS NULL)
    AND (telefono IS NULL) = (telefono_texto_version IS NULL)
  ),
  -- Foto y teléfono solo con la chapa ya confirmada (DD6): ninguna subida sin token.
  CONSTRAINT pet_chapas_extras_confirmada CHECK (
    confirmado_at IS NOT NULL OR (foto_clave IS NULL AND telefono IS NULL)
  ),
  UNIQUE (codigo, empresa_id),
  FOREIGN KEY (lote_id, empresa_id) REFERENCES public.pet_chapa_lotes(id, empresa_id) ON DELETE RESTRICT
);

CREATE INDEX ON public.pet_chapas(empresa_id);
CREATE INDEX ON public.pet_chapas(lote_id);
-- Cron de purga (DD8): pendientes con más de 48 h.
CREATE INDEX idx_pet_chapas_pendientes ON public.pet_chapas(consiente_perfil_at)
  WHERE email IS NOT NULL AND confirmado_at IS NULL;
-- Tripwire de conservación (DD16): perfiles activos por antigüedad de confirmación.
CREATE INDEX idx_pet_chapas_conservacion ON public.pet_chapas(confirmado_at)
  WHERE confirmado_at IS NOT NULL;

-- ── Interruptor por tenant (R-QR.13.1) ────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS pet_id_qr_habilitado BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.empresas.pet_id_qr_habilitado IS
  'Módulo de chapas QR para mascotas (pet-id-qr-profile). '
  'Solo lo cambia el superadmin (superadminUpdateEmpresaSchema). R-QR.13.1.';

-- Aditivo, igual que 20261118000001_empresas_kits_caducidad.sql: amplía el
-- GRANT por columna de 20261110000001_restrict_empresas_secret_columns.sql
-- sin reescribir la lista completa. Solo `authenticated`; NUNCA a `anon` (la
-- página pública del QR y el alta van por service_role).
GRANT SELECT (pet_id_qr_habilitado) ON public.empresas TO authenticated;

-- ── RLS + GRANTs ───────────────────────────────────────────────────────────
ALTER TABLE public.pet_chapa_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_chapas ENABLE ROW LEVEL SECURITY;

-- Ninguna de las dos tablas es alcanzable sin sesión ni con service_role
-- suplantado: RESTRICTIVE se combina con AND a cualquier otra policy.
CREATE POLICY "No direct anon access to pet_chapa_lotes" ON public.pet_chapa_lotes
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "No direct anon access to pet_chapas" ON public.pet_chapas
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- `pet_chapa_lotes`: el admin del tenant gestiona sus propios lotes (crear,
-- ver el recuento, generar más códigos). Igual que `kit_lotes`.
CREATE POLICY "Admin ve pet_chapa_lotes" ON public.pet_chapa_lotes
  FOR SELECT TO authenticated USING (empresa_id = (SELECT private.get_mi_empresa_id()));
CREATE POLICY "Admin inserta pet_chapa_lotes" ON public.pet_chapa_lotes
  FOR INSERT TO authenticated WITH CHECK (empresa_id = (SELECT private.get_mi_empresa_id()));
CREATE POLICY "Admin edita pet_chapa_lotes" ON public.pet_chapa_lotes
  FOR UPDATE TO authenticated
  USING (empresa_id = (SELECT private.get_mi_empresa_id()))
  WITH CHECK (empresa_id = (SELECT private.get_mi_empresa_id()));
CREATE POLICY "Admin elimina pet_chapa_lotes" ON public.pet_chapa_lotes
  FOR DELETE TO authenticated USING (empresa_id = (SELECT private.get_mi_empresa_id()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_chapa_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_chapa_lotes TO service_role;

-- `pet_chapas` (DD7): SIN ninguna policy ni GRANT para `authenticated`. El
-- admin nunca ve PII directamente; los recuentos y el borrado auditado pasan
-- por casos de uso con `service_role`. Solo queda la RESTRICTIVE de anon
-- (deniega todo) y el acceso completo de `service_role`.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_chapas TO service_role;
