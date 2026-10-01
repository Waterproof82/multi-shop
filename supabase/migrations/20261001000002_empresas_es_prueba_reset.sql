-- Empresas de prueba: poder resetear sus pedidos, cobros, turnos y clientes
-- sin abrir la puerta a borrar registros fiscales de un tenant real.
--
-- Hasta ahora la única excepción al bloqueo de DELETE era `pedidos.es_prueba`,
-- que solo fijan los tests E2E en el INSERT. Los pedidos hechos a mano en una
-- empresa de pruebas nacen con `es_prueba = false` y son imborrables.
--
-- Se sube la excepción un nivel: la EMPRESA es de prueba. Barreras:
--   1. `empresas.es_prueba` es inmutable (trigger). Solo se fija al crear la
--      empresa o en una migración como esta, que queda en git. Si se pudiera
--      activar después, marcar un tenant real como prueba y resetearlo sería
--      una puerta trasera al Art.66 LGT. NUNCA exponerlo en un DTO de Zod.
--   2. El reset se niega si la empresa envía registros a VeriFactu: lo que ya
--      llegó a la AEAT no se puede deshacer borrando de nuestro lado.
--   3. Cada reset queda registrado en `empresas_prueba_reset_log` (solo
--      inserción), y cada pedido borrado en `pedidos_prueba_purga_log`.
--
-- Lo que se borra: pedidos, cobros del TPV (la cadena de hash ENTERA, para que
-- vuelva a empezar limpia), turnos de caja con sus eventos, y clientes.
-- Se conserva todo lo demás: catálogo, fotos, landing, configuración, mesas,
-- empleados y fichajes.

-- ── 1. Flag de empresa de prueba ─────────────────────────────────────────────
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS es_prueba boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.empresas.es_prueba IS
  'Empresa de pruebas: sus datos operativos se pueden resetear con '
  'reset_empresa_prueba(). Inmutable. NUNCA exponer en un DTO.';

-- La empresa de pruebas del propietario (dominio localhost). Se marca ANTES de
-- crear el trigger de inmutabilidad.
UPDATE public.empresas
  SET es_prueba = true
  WHERE id = '8c5aa146-7fd9-436f-83c6-041118aaa625';

CREATE OR REPLACE FUNCTION public.empresas_es_prueba_inmutable()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NEW.es_prueba IS DISTINCT FROM OLD.es_prueba THEN
    RAISE EXCEPTION 'empresas.es_prueba es inmutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.empresas_es_prueba_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.empresas_es_prueba_inmutable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.empresas_es_prueba_inmutable() FROM authenticated;

DROP TRIGGER IF EXISTS empresas_es_prueba_inmutable ON public.empresas;
CREATE TRIGGER empresas_es_prueba_inmutable
  BEFORE UPDATE OF es_prueba ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.empresas_es_prueba_inmutable();

-- ── 2. Triggers de borrado: excepción para empresas de prueba ────────────────
-- La consulta va inline (no en una función auxiliar): un trigger que llamara a
-- una función sin EXECUTE para el rol que borra lanzaría "permission denied"
-- en vez del mensaje de cumplimiento.

CREATE OR REPLACE FUNCTION public.pedidos_block_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  -- Barrera 1: un pedido real de una empresa real nunca se borra.
  IF NOT OLD.es_prueba AND NOT EXISTS (
    SELECT 1 FROM public.empresas e WHERE e.id = OLD.empresa_id AND e.es_prueba
  ) THEN
    RAISE EXCEPTION
      'pedidos: DELETE no permitido (Art.66 LGT - retencion fiscal minima 5 anos)';
  END IF;

  -- Barrera 2: con cobro emitido, se conserva. En una empresa de prueba,
  -- reset_empresa_prueba() borra antes los cobros, así que aquí ya no quedan.
  IF OLD.sesion_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tpv_cobros c WHERE c.sesion_id = OLD.sesion_id
  ) THEN
    RAISE EXCEPTION
      'pedidos: DELETE bloqueado - el pedido % tiene cobros asociados (documento fiscal emitido)',
      OLD.id;
  END IF;

  -- Barrera 3: dejar constancia de lo que se borra.
  INSERT INTO public.pedidos_prueba_purga_log
    (pedido_id, empresa_id, numero_pedido, total, pedido_creado)
  VALUES
    (OLD.id, OLD.empresa_id, OLD.numero_pedido, OLD.total, OLD.created_at);

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_cobro_block_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.empresas e WHERE e.id = OLD.empresa_id AND e.es_prueba
  ) THEN
    RAISE EXCEPTION 'tpv_cobros: DELETE no permitido (cumplimiento fiscal RD 1619/2012)';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_turno_block_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.empresas e WHERE e.id = OLD.empresa_id AND e.es_prueba
  ) THEN
    RAISE EXCEPTION 'tpv_turnos: DELETE no permitido (SIALTI / Ley 11/2021)';
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.tpv_turno_evento_block_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.empresas e WHERE e.id = OLD.empresa_id AND e.es_prueba
  ) THEN
    RAISE EXCEPTION 'tpv_turno_eventos: DELETE no permitido (SIALTI audit trail)';
  END IF;
  RETURN OLD;
END;
$$;

-- ── 3. Log de resets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.empresas_prueba_reset_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid        NOT NULL,
  pedidos        integer     NOT NULL,
  cobros         integer     NOT NULL,
  turnos         integer     NOT NULL,
  clientes       integer     NOT NULL,
  reseteado_por  text        NOT NULL CHECK (char_length(reseteado_por) <= 200),
  reseteado_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.empresas_prueba_reset_log IS
  'Traza de solo inserción de los resets de empresas de prueba.';

CREATE INDEX IF NOT EXISTS idx_empresas_prueba_reset_log_empresa
  ON public.empresas_prueba_reset_log (empresa_id, reseteado_at DESC);

ALTER TABLE public.empresas_prueba_reset_log ENABLE ROW LEVEL SECURITY;

-- RESTRICTIVE: ninguna policy permisiva añadida después puede anularla.
-- Sin policy para authenticated: solo lo lee el backend (service_role).
DROP POLICY IF EXISTS "No direct anon access to empresas_prueba_reset_log" ON public.empresas_prueba_reset_log;
CREATE POLICY "No direct anon access to empresas_prueba_reset_log"
  ON public.empresas_prueba_reset_log AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

GRANT SELECT, INSERT ON public.empresas_prueba_reset_log TO service_role;

CREATE OR REPLACE FUNCTION public.empresas_prueba_reset_log_inmutable()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  RAISE EXCEPTION 'empresas_prueba_reset_log es de solo inserción';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.empresas_prueba_reset_log_inmutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.empresas_prueba_reset_log_inmutable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.empresas_prueba_reset_log_inmutable() FROM authenticated;

DROP TRIGGER IF EXISTS empresas_prueba_reset_log_no_update ON public.empresas_prueba_reset_log;
CREATE TRIGGER empresas_prueba_reset_log_no_update
  BEFORE UPDATE OR DELETE ON public.empresas_prueba_reset_log
  FOR EACH ROW EXECUTE FUNCTION public.empresas_prueba_reset_log_inmutable();

-- ── 4. Reset ─────────────────────────────────────────────────────────────────
-- Todo en la transacción de la llamada: si algo falla, no se borra nada.
CREATE OR REPLACE FUNCTION public.reset_empresa_prueba(p_empresa_id uuid, p_actor text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  v_es_prueba  boolean;
  v_verifactu  text;
  v_pedidos    integer;
  v_cobros     integer;
  v_turnos     integer;
  v_clientes   integer;
BEGIN
  SELECT es_prueba, verifactu_mode INTO v_es_prueba, v_verifactu
  FROM public.empresas WHERE id = p_empresa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reset_empresa_prueba: empresa % no existe', p_empresa_id;
  END IF;
  IF NOT v_es_prueba THEN
    RAISE EXCEPTION 'reset_empresa_prueba: la empresa % no es de prueba', p_empresa_id;
  END IF;
  IF v_verifactu = 'verifactu' THEN
    RAISE EXCEPTION 'reset_empresa_prueba: la empresa % envía registros a VeriFactu', p_empresa_id;
  END IF;

  -- Orden hijo → padre. Los cobros van antes que los pedidos (barrera 2 del
  -- trigger de pedidos) y que los turnos (FK RESTRICT).
  DELETE FROM public.tpv_cobros WHERE empresa_id = p_empresa_id;
  GET DIAGNOSTICS v_cobros = ROW_COUNT;

  DELETE FROM public.pedidos WHERE empresa_id = p_empresa_id;
  GET DIAGNOSTICS v_pedidos = ROW_COUNT;

  -- Stock y mermas se conservan; solo pierden la referencia al turno borrado.
  UPDATE public.movimientos_stock SET turno_id = NULL
    WHERE turno_id IN (SELECT id FROM public.tpv_turnos WHERE empresa_id = p_empresa_id);
  UPDATE public.mermas SET turno_id = NULL
    WHERE turno_id IN (SELECT id FROM public.tpv_turnos WHERE empresa_id = p_empresa_id);

  DELETE FROM public.tpv_turno_eventos WHERE empresa_id = p_empresa_id;
  DELETE FROM public.tpv_turnos WHERE empresa_id = p_empresa_id;
  GET DIAGNOSTICS v_turnos = ROW_COUNT;

  DELETE FROM public.clientes WHERE empresa_id = p_empresa_id;
  GET DIAGNOSTICS v_clientes = ROW_COUNT;

  INSERT INTO public.empresas_prueba_reset_log
    (empresa_id, pedidos, cobros, turnos, clientes, reseteado_por)
  VALUES
    (p_empresa_id, v_pedidos, v_cobros, v_turnos, v_clientes, left(coalesce(p_actor, current_user), 200));

  RETURN jsonb_build_object(
    'pedidos', v_pedidos, 'cobros', v_cobros, 'turnos', v_turnos, 'clientes', v_clientes
  );
END;
$$;

-- Solo el backend. Sin estos REVOKE la función quedaría expuesta en
-- /rest/v1/rpc/reset_empresa_prueba para cualquier cliente anónimo.
REVOKE EXECUTE ON FUNCTION public.reset_empresa_prueba(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_empresa_prueba(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_empresa_prueba(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.reset_empresa_prueba(uuid, text) TO service_role;
